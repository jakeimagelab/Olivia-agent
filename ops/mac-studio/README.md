# Mac Studio Worker 설치

이 디렉터리의 `bin/worker.sh`와 `bin/remote-bridge.sh`가 Mac Studio Worker의
배포 원본이다. 실제 실행 위치는 기존과 동일한 `~/OliviaWorker/bin/`이다.

## 1. ZIP 복사본을 Git clone으로 교체

Mac Studio 터미널에서 실행한다. 기존 ZIP 폴더는 삭제하지 않고 백업 이름으로 이동한다.

```zsh
mv ~/UGnasync/Cloade/Olivia-agent-main "$HOME/UGnasync/Cloade/Olivia-agent-main.zip-backup-$(date +%Y%m%d-%H%M%S)"
git clone git@github.com:jakeimagelab/Olivia-agent.git ~/olivia-worker
cd ~/olivia-worker
npm ci
```

SSH 인증이 설정되지 않았다면 GitHub에서 clone 권한을 먼저 연결한다. HTTPS를 사용하는
환경에서는 clone URL만 해당 저장소의 HTTPS 주소로 바꾼다.

## 2. Worker bin 최초 설치

현재 운영 clone이 `~/olivia-worker`라면 다음 한 줄을 사용한다.

```zsh
cd ~/olivia-worker && git pull --ff-only origin main && ./ops/mac-studio/install-worker-bin.sh --restart
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
OLIVIA_REPO_ROOT=/Users/jakemacstudio/olivia-worker
OLIVIA_PHOTO_SOURCE_ROOT="/Volumes/Workstation(M.2SSD)"
OLIVIA_PHOTO_WORK_ROOT="/Volumes/Agentstation"
```

`WORKER_TOKEN`, `WORKER_ID`, `SOURCE_ROOT` 기존 별칭도 호환한다. 새 인증키를 만들지
않고 서버의 기존 `OLIVIA_WORKER_TOKEN`과 같은 값을 사용한다.

## 4. Worker 재시작과 확인

`--restart`를 사용하지 않은 경우 OliviaWorker.app LaunchAgent를 한 번 재시작한다.

```zsh
launchctl kickstart -k "gui/$(id -u)/com.olivia.macstudio.oliviaworker"
tail -f ~/OliviaWorker/logs/launch.err.log
```

별도 legacy LaunchAgent를 아직 쓰는 Mac에서는 로드된 label을 먼저 확인한다.

```zsh
launchctl list | grep -i olivia
```

설치본과 저장소가 같은지 확인한 뒤, 채팅/원격 Finder에서 최상위 폴더를 한 번 조회한다.

```zsh
cmp ~/olivia-worker/ops/mac-studio/bin/worker.sh ~/OliviaWorker/bin/worker.sh
cmp ~/olivia-worker/ops/mac-studio/bin/remote-bridge.sh ~/OliviaWorker/bin/remote-bridge.sh
tail -100 ~/OliviaWorker/logs/launch.err.log | grep 'LIST_FOLDER completed: ROOT'
```

마지막 명령에 `LIST_FOLDER completed: ROOT`가 나오면 명시적 ROOT 조회가 설치본까지 도달한
것이다. 실제 사진 작업 전에는 Workstation과 Agentstation 접근 상태가 `ACCESSIBLE`인지 확인한다.

## 5. 이후 업데이트

최초 installer가 tracked `post-merge` hook을 연결하므로 이후에는 같은 clone에서 평소처럼
다음 명령만 실행하면 pull 직후 `~/OliviaWorker/bin`도 자동 갱신된다.

```zsh
cd ~/olivia-worker
git pull --ff-only origin main
```

자동 설치 결과는 다음 로그에 남는다.

```zsh
tail -100 ~/OliviaWorker/logs/worker-install.log
```

저장소에 이미 다른 `core.hooksPath`가 설정돼 있으면 installer는 이를 덮어쓰지 않는다.
그 경우에는 다음 한 줄을 사용한다.

```zsh
git pull --ff-only origin main && ./ops/mac-studio/install-worker-bin.sh --restart
```

설치기가 연결한 tracked `post-merge` hook은 pull 직후 bin 설치와 OliviaWorker 재시작까지
수행한다. `OLIVIA_SKIP_GIT_HOOK=1`로 hook을 설치하지 않은 환경에서는 위의 installer
`--restart` 한 줄을 직접 실행한다.

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
