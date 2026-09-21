# Mac Studio Worker 설치

이 디렉터리의 `bin/worker.sh`와 `bin/remote-bridge.sh`가 Mac Studio Worker의
배포 원본이다. 실제 실행 위치는 기존과 동일한 `~/OliviaWorker/bin/`이다.

## 1. ZIP 복사본을 Git clone으로 교체

Mac Studio 터미널에서 실행한다. 기존 ZIP 폴더는 삭제하지 않고 백업 이름으로 이동한다.

```zsh
cd ~/UGnasync/Cloade
mv Olivia-agent-main "Olivia-agent-main.zip-backup-$(date +%Y%m%d-%H%M%S)"
git clone git@github.com:jakeimagelab/Olivia-agent.git Olivia-agent-main
cd Olivia-agent-main
npm ci
```

SSH 인증이 설정되지 않았다면 GitHub에서 clone 권한을 먼저 연결한다. HTTPS를 사용하는
환경에서는 clone URL만 해당 저장소의 HTTPS 주소로 바꾼다.

## 2. Worker bin 최초 설치

```zsh
cd ~/UGnasync/Cloade/Olivia-agent-main
./ops/mac-studio/install-worker-bin.sh
```

설치기는 다음을 수행한다.

- 기존 `~/OliviaWorker/bin`을 `~/OliviaWorker/backups/worker-bin-날짜-시각/bin`으로 이동해 보존
- 새 `worker.sh`, `remote-bridge.sh`의 shell 문법 검사
- 검사가 끝난 새 bin 디렉터리로 교체
- `worker.env`, 로그, 상태 파일, LaunchAgent는 변경하지 않음
- 이 Git clone의 `post-merge` hook을 활성화

기존 bin이 한 번 백업된 뒤에만 새 bin이 설치된다. 설치 중 실패하면 가능한 경우 기존
bin을 즉시 복원한다.

## 3. 환경변수

기존 `~/OliviaWorker/config/worker.env`를 계속 사용한다. 최소 설정은 다음과 같다.

```dotenv
REMOTE_API_BASE=https://olivia.photoclinic.kr
OLIVIA_WORKER_TOKEN=기존_워커_토큰
OLIVIA_WORKER_ID=jake-macstudio-01
OLIVIA_REPO_ROOT=/Users/jakemacstudio/UGnasync/Cloade/Olivia-agent-main
OLIVIA_PHOTO_SOURCE_ROOT="/Volumes/Workstation(M.2SSD)"
OLIVIA_PHOTO_WORK_ROOT="/Volumes/Agentstation"
```

`WORKER_TOKEN`, `WORKER_ID`, `SOURCE_ROOT` 기존 별칭도 호환한다. 새 인증키를 만들지
않고 서버의 기존 `OLIVIA_WORKER_TOKEN`과 같은 값을 사용한다.

## 4. Worker 재시작과 확인

OliviaWorker.app LaunchAgent를 쓰는 현재 구조라면 설치 후 한 번 재시작한다.

```zsh
launchctl kickstart -k "gui/$(id -u)/com.olivia.macstudio.oliviaworker"
tail -f ~/OliviaWorker/logs/launch.err.log
```

별도 legacy LaunchAgent를 아직 쓰는 Mac에서는 로드된 label을 먼저 확인한다.

```zsh
launchctl list | grep -i olivia
```

첫 검증은 `PING` 또는 읽기 전용 원격 폴더 조회로 한다. 실제 사진 작업 전에는
Workstation과 Agentstation 접근 상태가 `ACCESSIBLE`인지 확인한다.

## 5. 이후 업데이트

최초 installer가 tracked `post-merge` hook을 연결하므로 이후에는 같은 clone에서 평소처럼
다음 명령만 실행하면 pull 직후 `~/OliviaWorker/bin`도 자동 갱신된다.

```zsh
cd ~/UGnasync/Cloade/Olivia-agent-main
git pull --ff-only
```

자동 설치 결과는 다음 로그에 남는다.

```zsh
tail -100 ~/OliviaWorker/logs/worker-install.log
```

저장소에 이미 다른 `core.hooksPath`가 설정돼 있으면 installer는 이를 덮어쓰지 않는다.
그 경우에는 다음 한 줄을 사용한다.

```zsh
git pull --ff-only && ./ops/mac-studio/install-worker-bin.sh
```

`git pull`은 실행 중인 프로세스를 자동 재시작하지 않는다. worker script 자체가 변경된
릴리스에서는 위 `launchctl kickstart`를 한 번 실행한다. job별로 새로 실행되는 bridge와
runner 코드는 pull/install 직후 새 버전을 사용한다.

## 6. 오류 확인

`remote-bridge.sh`는 runner의 오류를 `작업 실패`로 덮어쓰지 않는다. 서버의
`remote_jobs.error`에는 다음 우선순위로 원인이 저장된다.

1. runner 결과 JSON의 `error`
2. runner 결과 JSON의 `message`
3. stderr 마지막 오류
4. runner 종료코드

관련 로그:

```zsh
tail -100 ~/OliviaWorker/logs/launch.err.log
tail -100 ~/OliviaWorker/logs/bridge.err.log
tail -100 ~/OliviaWorker/logs/worker-install.log
```

## 7. 롤백

installer가 출력한 백업 경로를 사용한다. 먼저 Worker를 내리고 현재 bin을 별도 이름으로
보존한 뒤 백업을 복원한다.

```zsh
launchctl bootout "gui/$(id -u)/com.olivia.macstudio.oliviaworker"
mv "$HOME/OliviaWorker/bin" "$HOME/OliviaWorker/bin.failed-$(date +%Y%m%d-%H%M%S)"
mv ~/OliviaWorker/backups/worker-bin-YYYYMMDD-HHMMSS/bin ~/OliviaWorker/bin
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.olivia.macstudio.oliviaworker.plist
```
