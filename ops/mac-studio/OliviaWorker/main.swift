import Foundation
#if canImport(Darwin)
import Darwin
#endif

// OliviaWorker.app — macOS TCC 권한 영구 수정.
//
// 역할: 기존 worker.sh / remote-bridge.sh / nas-backup-watcher.ts 3개 프로세스를 감시·재시작한다.
// 이 세 스크립트의 로직·프로토콜·Job 구조는 전혀 건드리지 않는다 — 그대로 spawn만 한다.
//
// 배경: launchd가 /bin/zsh(worker.sh)를 직접 spawn하면, macOS TCC가 그 인터프리터 자체를
// code identity로 취급해서 Terminal에 부여된 NAS network volume 권한이 적용되지 않았다
// (PermissionError: Operation not permitted). 이 .app 하나의 고정된 code identity 아래에서
// 자식 프로세스를 실행하면, 자식은 이 앱의 TCC 권한 context를 물려받는다.

let home = FileManager.default.homeDirectoryForCurrentUser.path
let base = "\(home)/OliviaWorker"
let logsDir = "\(base)/logs"
let stateDir = "\(base)/state"
let repoPath = "\(home)/UGnasync/Cloade/Olivia-agent-main"
let lockPath = "\(stateDir)/oliviaworker.lock"
let healthPath = "\(stateDir)/oliviaworker_app_status.json"
let appLogPath = "\(logsDir)/oliviaworker-app.log"

func appLog(_ message: String) {
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let line = "[\(timestamp)] \(message)\n"
    guard let data = line.data(using: .utf8) else { return }
    if !FileManager.default.fileExists(atPath: appLogPath) {
        FileManager.default.createFile(atPath: appLogPath, contents: nil)
    }
    if let handle = FileHandle(forWritingAtPath: appLogPath) {
        handle.seekToEndOfFile()
        handle.write(data)
        try? handle.close()
    }
}

// MARK: - Singleton lock (요구사항 1 — 중복 Worker 방지)

func acquireSingletonLockOrExit() {
    let fm = FileManager.default
    if fm.fileExists(atPath: lockPath),
       let content = try? String(contentsOfFile: lockPath, encoding: .utf8),
       let existingPid = pid_t(content.trimmingCharacters(in: .whitespacesAndNewlines)) {
        // PID가 아직 살아있으면(신호 0 전송 성공) 이미 실행 중인 인스턴스가 있다는 뜻이다.
        if kill(existingPid, 0) == 0 {
            appLog("이미 실행 중인 인스턴스(PID \(existingPid))가 있어 종료합니다.")
            exit(0)
        }
        appLog("오래된 lock 파일(PID \(existingPid), 이미 종료됨) 정리 후 계속합니다.")
    }
    let myPid = String(ProcessInfo.processInfo.processIdentifier)
    try? myPid.write(toFile: lockPath, atomically: true, encoding: .utf8)
}

func releaseSingletonLock() {
    try? FileManager.default.removeItem(atPath: lockPath)
}

// MARK: - 감시 대상 프로세스 하나

final class ManagedProcess {
    let name: String
    let executablePath: String
    let arguments: [String]
    let extraEnvironment: [String: String]
    let stdoutPath: String
    let stderrPath: String

    private(set) var process: Process?
    private(set) var restartCount = 0
    private(set) var lastExitCode: Int32?
    private(set) var lastStartedAt: Date?

    init(
        name: String,
        executablePath: String,
        arguments: [String],
        extraEnvironment: [String: String] = [:],
        stdoutPath: String,
        stderrPath: String
    ) {
        self.name = name
        self.executablePath = executablePath
        self.arguments = arguments
        self.extraEnvironment = extraEnvironment
        self.stdoutPath = stdoutPath
        self.stderrPath = stderrPath
    }

    private func appendingFileHandle(_ path: String) -> FileHandle {
        let fm = FileManager.default
        if !fm.fileExists(atPath: path) {
            fm.createFile(atPath: path, contents: nil)
        }
        let handle = FileHandle(forWritingAtPath: path) ?? FileHandle.nullDevice
        handle.seekToEndOfFile()
        return handle
    }

    // extraEnvironment가 비어 있으면 environment를 아예 설정하지 않는다 — Foundation의
    // 기본 동작(nil이면 부모 프로세스 환경을 그대로 상속)을 그대로 쓴다. 이게 launchd가
    // 예전에 이 스크립트를 직접 실행하던 것과 동일한 환경 상속 방식이다(기존 동작 변경 금지).
    func start(onExit: @escaping (ManagedProcess, Int32) -> Void) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executablePath)
        proc.arguments = arguments
        if !extraEnvironment.isEmpty {
            var env = ProcessInfo.processInfo.environment
            for (key, value) in extraEnvironment { env[key] = value }
            proc.environment = env
        }
        proc.standardOutput = appendingFileHandle(stdoutPath)
        proc.standardError = appendingFileHandle(stderrPath)

        proc.terminationHandler = { [weak self] finished in
            guard let self = self else { return }
            self.lastExitCode = finished.terminationStatus
            onExit(self, finished.terminationStatus)
        }

        do {
            try proc.run()
            self.process = proc
            self.lastStartedAt = Date()
            appLog("\(name) 시작됨 (PID \(proc.processIdentifier))")
        } catch {
            appLog("\(name) 시작 실패: \(error.localizedDescription)")
            onExit(self, -1)
        }
    }

    func terminate() {
        guard let proc = process, proc.isRunning else { return }
        proc.terminate() // SIGTERM
    }

    func forceKill() {
        guard let proc = process, proc.isRunning else { return }
        kill(proc.processIdentifier, SIGKILL)
    }

    var isRunning: Bool { process?.isRunning ?? false }
    var pid: Int32? { isRunning ? process?.processIdentifier : nil }

    func markRestarted() { restartCount += 1 }
}

// MARK: - Supervisor (요구사항 3 — health 상태 관리, 요구사항 4 — clean shutdown)

final class Supervisor {
    private let queue = DispatchQueue(label: "com.olivia.macstudio.oliviaworker.supervisor")
    private var managed: [ManagedProcess] = []
    private var stopping = false
    private let restartDelaySeconds: TimeInterval = 10 // 기존 launchd plist의 ThrottleInterval과 동일

    func addAndStart(_ process: ManagedProcess) {
        managed.append(process)
        startWithRestartHandling(process)
    }

    private func startWithRestartHandling(_ process: ManagedProcess) {
        process.start { [weak self] finishedProcess, exitCode in
            guard let self = self else { return }
            self.queue.async {
                guard !self.stopping else {
                    appLog("\(finishedProcess.name) 종료됨(exit \(exitCode)) — 앱 종료 중이라 재시작하지 않습니다.")
                    return
                }
                appLog("\(finishedProcess.name) 예기치 않게 종료됨(exit \(exitCode)) — \(Int(self.restartDelaySeconds))초 후 재시작합니다.")
                finishedProcess.markRestarted()
                self.queue.asyncAfter(deadline: .now() + self.restartDelaySeconds) {
                    guard !self.stopping else { return }
                    self.startWithRestartHandling(finishedProcess)
                }
            }
        }
    }

    func shutdown(completion: @escaping () -> Void) {
        queue.async {
            self.stopping = true
            appLog("종료 신호 수신 — 자식 프로세스를 정리합니다.")
            for process in self.managed {
                process.terminate()
            }
            self.queue.asyncAfter(deadline: .now() + 5) {
                for process in self.managed where process.isRunning {
                    appLog("\(process.name)이(가) 5초 안에 종료되지 않아 강제 종료합니다.")
                    process.forceKill()
                }
                completion()
            }
        }
    }

    func writeHealthSnapshot() {
        queue.async {
            let entries: [[String: Any]] = self.managed.map { process in
                [
                    "name": process.name,
                    "running": process.isRunning,
                    "pid": process.pid ?? NSNull(),
                    "restartCount": process.restartCount,
                    "lastExitCode": process.lastExitCode ?? NSNull(),
                    "lastStartedAt": process.lastStartedAt.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull(),
                ]
            }
            let snapshot: [String: Any] = [
                "updatedAt": ISO8601DateFormatter().string(from: Date()),
                "processes": entries,
            ]
            if let data = try? JSONSerialization.data(withJSONObject: snapshot, options: [.prettyPrinted]) {
                try? data.write(to: URL(fileURLWithPath: healthPath))
            }
        }
    }
}

// MARK: - Entry point

try? FileManager.default.createDirectory(atPath: logsDir, withIntermediateDirectories: true)
try? FileManager.default.createDirectory(atPath: stateDir, withIntermediateDirectories: true)

appLog("OliviaWorker.app supervisor 시작 (PID \(ProcessInfo.processInfo.processIdentifier))")
acquireSingletonLockOrExit()

let supervisor = Supervisor()

// 기존 com.olivia.macstudio.worker.plist의 ProgramArguments와 완전히 동일 — 로그 경로도
// launch.out.log/launch.err.log 그대로 재사용한다(요구사항 5 — 기존 로그 유지).
let worker = ManagedProcess(
    name: "worker.sh",
    executablePath: "/bin/zsh",
    arguments: ["\(base)/bin/worker.sh"],
    stdoutPath: "\(logsDir)/launch.out.log",
    stderrPath: "\(logsDir)/launch.err.log"
)

// 기존 com.olivia.macstudio.remote-bridge.plist와 완전히 동일.
let remoteBridge = ManagedProcess(
    name: "remote-bridge.sh",
    executablePath: "/bin/zsh",
    arguments: ["\(base)/bin/remote-bridge.sh"],
    stdoutPath: "\(logsDir)/bridge.out.log",
    stderrPath: "\(logsDir)/bridge.err.log"
)

// ops/mac-studio/com.olivia.macstudio.nas-watcher.plist 템플릿(한 번도 설치된 적 없음)과
// 완전히 동일한 커맨드·로그 경로·환경변수를 그대로 재현한다. node는 로그인 셸에서만 PATH에
// 잡히므로 zsh -lc가 필요하고, tsx는 global이 아니라 repo의 node_modules/tsx를 쓴다
// (node --import tsx가 그 local 모듈을 resolve한다).
let nasWatcher = ManagedProcess(
    name: "nas-backup-watcher.ts",
    executablePath: "/bin/zsh",
    arguments: ["-lc", "cd \"\(repoPath)\" && exec node --import tsx scripts/nas-backup-watcher.ts"],
    extraEnvironment: [
        "PATH": "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
        "OLIVIA_NAS_WATCH_STATE_PATH": "\(stateDir)/nas-watcher.json",
    ],
    stdoutPath: "\(logsDir)/nas-watcher.stdout.log",
    stderrPath: "\(logsDir)/nas-watcher.stderr.log"
)

supervisor.addAndStart(worker)
supervisor.addAndStart(remoteBridge)
supervisor.addAndStart(nasWatcher)

// 30초마다 health 상태 파일 갱신.
let healthTimer = DispatchSource.makeTimerSource(queue: .main)
healthTimer.schedule(deadline: .now() + 5, repeating: 30)
healthTimer.setEventHandler { supervisor.writeHealthSnapshot() }
healthTimer.resume()

// SIGTERM/SIGINT 기본 동작을 막고(SIG_IGN) DispatchSource로 직접 처리해야 자식 프로세스를
// 정리할 시간을 벌 수 있다(요구사항 4 — 종료 시 child process clean shutdown).
signal(SIGTERM, SIG_IGN)
signal(SIGINT, SIG_IGN)

func handleShutdownSignal() {
    supervisor.shutdown {
        releaseSingletonLock()
        appLog("정상 종료했습니다.")
        exit(0)
    }
}

let sigtermSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
sigtermSource.setEventHandler { handleShutdownSignal() }
sigtermSource.resume()

let sigintSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
sigintSource.setEventHandler { handleShutdownSignal() }
sigintSource.resume()

dispatchMain()
