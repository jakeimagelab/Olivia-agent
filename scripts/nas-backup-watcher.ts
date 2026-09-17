#!/usr/bin/env node

// Olivia OS 2.0 — PHASE 6 NAS Backup Watcher + Backup Ready Notification.
//
// 왜 완전히 새로운 감지 엔진을 만들지 않았는가: scripts/photo-storage-watcher.ts가 쓰는
// PhotoStorageWatcher(lib/photo-classifier/node/photoWatcher.ts)가 이미 baseline/신규 감지/
// 안정화(stable duration)/SOURCE_OFFLINE 복구/atomic state 저장/중복 실행 방지 lock을 전부
// 검증된 상태로 구현하고 있다. 이 스크립트는 그 엔진을 "다른 report 대상"(photo_storage_projects
// 대신 worker_events/BACKUP_READY)으로 재사용만 한다 — 상태 파일과 워커 이름을 분리해서 기존
// PHASE 3-6 파이프라인(photo:watch)과 서로 간섭하지 않는다.
//
// 이 스크립트는 이 Next.js 저장소의 체크아웃 안에서 실행되는 것을 전제로 한다(기존
// photo-storage-watcher.ts와 동일한 실행 모델). Mac Studio의 /Users/jakemacstudio/OliviaWorker/
// 안에 있는 worker.sh/remote-bridge.sh와는 별개 프로세스이며 서로를 대체하지 않는다.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { PhotoStorageWatcher, type PhotoWatcherReadyReport } from "@/lib/photo-classifier/node/photoWatcher";
import { resolveServerBaseUrl } from "@/lib/baseUrl";

loadEnvConfig(process.cwd());

// worker.env(bin/worker.sh 등 기존 Mac Studio 스크립트가 쓰는 파일)를 이 프로세스의 실행
// 방식과 무관하게 추가로 읽는다 — launchd EnvironmentVariables에 다 옮겨적지 않아도 되게
// 하기 위한 최소한의 편의 기능이다. .env.local에 이미 있는 값은 덮어쓰지 않는다(우선순위:
// 이미 설정된 process.env > .env.local > worker.env).
function loadWorkerEnvFile(): void {
  const configuredPath = process.env.OLIVIA_WORKER_ENV_PATH?.trim();
  const candidate = configuredPath || path.join(process.env.HOME || "", "OliviaWorker", "config", "worker.env");
  if (!existsSync(candidate)) return;
  const raw = readFileSync(candidate, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
loadWorkerEnvFile();

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name}은(는) 0보다 큰 숫자여야 합니다.`);
  return parsed;
}

type BackupReadyEventPayload = {
  workerId: string;
  eventType: "BACKUP_READY";
  source: "NAS";
  sourceRoot: string;
  folderName: string;
  fileCount: number;
  totalBytes: number;
  detectedAt: string;
  readyAt: string;
};

const args = process.argv.slice(2);
const once = args.includes("--once");

async function main(): Promise<void> {
  // §5 "worker.env를 읽어 SOURCE_ROOT... 사용한다" — 기존 사진 파이프라인이 쓰는
  // OLIVIA_PHOTO_SOURCE_ROOT를 그대로 재사용할 수 있으면 재사용하되(같은 볼륨), 사용자가 지정한
  // SOURCE_ROOT 변수명을 우선한다.
  const sourceRoot = process.env.SOURCE_ROOT?.trim() || process.env.OLIVIA_PHOTO_SOURCE_ROOT?.trim();
  if (!sourceRoot) {
    console.error("[NAS_WATCHER] ERROR SOURCE_ROOT(또는 OLIVIA_PHOTO_SOURCE_ROOT) 환경변수가 설정되어 있지 않습니다.");
    process.exitCode = 1;
    return;
  }
  // workRoot(SSD2)는 이 watcher의 스캔 로직에서 실제로 쓰이지 않는다(로그 redaction에만
  // 쓰임) — §0 "SSD2 연결 때문에 NAS Watcher가 실패하면 안 된다"를 지키기 위해
  // getStorageRoots()(OLIVIA_PHOTO_WORK_ROOT 필수)를 거치지 않고 여기서 직접 구성한다.
  const workRoot = process.env.OLIVIA_PHOTO_WORK_ROOT?.trim() || sourceRoot;

  const remoteApiBase = (process.env.REMOTE_API_BASE?.trim() || resolveServerBaseUrl()).replace(/\/+$/, "");
  const eventsUrl = `${remoteApiBase}/api/worker/events`;
  const workerToken = process.env.WORKER_TOKEN?.trim() || process.env.OLIVIA_WORKER_TOKEN?.trim();
  if (!workerToken) {
    console.error("[NAS_WATCHER] ERROR WORKER_TOKEN(또는 OLIVIA_WORKER_TOKEN)이 설정되어 있지 않습니다.");
    process.exitCode = 1;
    return;
  }
  const workerId = process.env.WORKER_ID?.trim() || process.env.OLIVIA_WORKER_ID?.trim() || "jake-macstudio-01";
  const vercelBypassSecret = process.env.VERCEL_BYPASS_SECRET?.trim();

  const watcher = new PhotoStorageWatcher({
    roots: { sourceRoot, workRoot },
    // §7 "이미 알려준 폴더를 다시 BACKUP_READY로 알리지 말 것" — 기존 photo:watch와 완전히
    // 분리된 상태 파일을 쓴다. 같은 파일을 공유하면 두 watcher가 서로의 baseline/READY 판정을
    // 덮어써서 §18-6(기존 폴더를 신규 백업으로 오판 금지)을 어길 위험이 생긴다.
    statePath: optionValue(args, "--state-path")
      || process.env.OLIVIA_NAS_WATCH_STATE_PATH?.trim()
      || path.join(process.cwd(), ".olivia", "nas-watcher-state.json"),
    // §5-1/§5-4 기본값: 30초 주기, 90초(30초×3회) 안정화.
    intervalSeconds: positiveNumber(optionValue(args, "--interval-seconds"), "--interval-seconds")
      ?? positiveNumber(process.env.OLIVIA_NAS_WATCH_INTERVAL_SECONDS, "OLIVIA_NAS_WATCH_INTERVAL_SECONDS")
      ?? 30,
    stableSeconds: positiveNumber(optionValue(args, "--stable-seconds"), "--stable-seconds")
      ?? positiveNumber(process.env.OLIVIA_NAS_STABLE_SECONDS, "OLIVIA_NAS_STABLE_SECONDS")
      ?? 90,
    logger: (message) => console.log(message.replace("[PHOTO_WATCHER]", "[NAS_WATCHER]")),
    reportReady: async (report: PhotoWatcherReadyReport) => {
      // REVIEW_REQUIRED는 이 watcher가 쓰지 않는 상태다(§5-4에 그런 판정 없음) — 방어적으로
      // READY만 이벤트로 내보낸다.
      if (report.status !== "READY") return;
      const payload: BackupReadyEventPayload = {
        workerId,
        eventType: "BACKUP_READY",
        source: "NAS",
        sourceRoot,
        folderName: report.projectName,
        fileCount: report.fileCount,
        totalBytes: report.totalBytes,
        detectedAt: report.firstSeenAt,
        readyAt: new Date().toISOString(),
      };
      const response = await fetch(eventsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${workerToken}`,
          "x-olivia-worker": workerId,
          ...(vercelBypassSecret ? { "x-vercel-protection-bypass": vercelBypassSecret } : {}),
        },
        body: JSON.stringify(payload),
      });
      // §13 "Application Error 방지" — 이 리포트 실패가 watcher 프로세스를 죽이면 안 된다.
      // 예외를 던지면 PhotoStorageWatcher가 serverSyncStatus를 PENDING으로 유지하고
      // 다음 scan에서 자동 재전송한다(§8 "전송 실패하면 BACKUP_READY 상태 유지").
      if (response.status !== 200 && response.status !== 201) {
        const body = await response.text().catch(() => "");
        throw new Error(`이벤트 전송 실패 (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
    },
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await watcher.stop();
    if (!once) process.exit(0);
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });

  try {
    console.log(`[NAS_WATCHER] NAS Watcher started (source=${sourceRoot})`);
    const result = await watcher.start({ once });
    if (once) process.stdout.write(`${JSON.stringify(result)}\n`);
    else await new Promise<void>(() => undefined);
  } catch (error) {
    await watcher.stop().catch(() => undefined);
    console.error(`[NAS_WATCHER] ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main();
