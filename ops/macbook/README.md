# MacBook Pro 영상작업 Worker 설치

MacBook Pro의 로컬 촬영본, 외장 SSD 또는 SD카드를 영상작업실에서 직접 분석하는 Worker 설치 절차다. 기존 Mac Studio와 동일한 bridge 및 영상 runner를 사용하며 Worker ID와 저장 경로만 분리한다.

## 1. Vercel 환경변수

Production 환경에 다음 값을 등록하고 재배포한다. 기존 `OLIVIA_WORKER_ID`와 `OLIVIA_WORKER_TOKEN`은 삭제하지 않는다.

```dotenv
OLIVIA_WORKER_ID=jake-macstudio-01
OLIVIA_WORKER_IDS=jake-macstudio-01,jake-macbookpro-01
OLIVIA_WORKER_TOKEN=<기존 Mac Studio 공용 토큰 또는 fallback 토큰>
OLIVIA_WORKER_TOKENS_JSON={"jake-macbookpro-01":"<맥북 전용 토큰>"}
```

Mac Studio에도 전용 토큰을 쓰려면 JSON에 `jake-macstudio-01` 항목을 함께 넣는다. JSON에 Worker별 토큰이 있으면 공용 토큰보다 우선한다.

## 2. 저장소와 의존성

```zsh
xcode-select --install 2>/dev/null || true
brew install node ffmpeg
git clone git@github.com:jakeimagelab/Olivia-agent.git ~/olivia-worker
cd ~/olivia-worker
npm ci
```

이미 clone이 있으면 다음 명령을 사용한다.

```zsh
cd ~/olivia-worker
git pull --ff-only origin main
npm ci
```

## 3. Whisper 환경

```zsh
python3 -m venv ~/OliviaWorker/venv-video
~/OliviaWorker/venv-video/bin/pip install -U pip mlx-whisper numpy
~/OliviaWorker/venv-video/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/whisper-large-v3-turbo')"
```

## 4. Worker 설치

```zsh
cd ~/olivia-worker
./ops/macbook/install-worker.sh
open -e ~/OliviaWorker/config/worker.env
```

`worker.env`의 `CHANGE_ME`와 토큰을 실제 값으로 바꾼다. 기본 예시는 다음과 같다.

```dotenv
REMOTE_API_BASE=https://olivia.photoclinic.kr
OLIVIA_WORKER_ID=jake-macbookpro-01
OLIVIA_WORKER_TOKEN=<맥북 전용 토큰>
OLIVIA_REPO_ROOT=/Users/<user>/olivia-worker
OLIVIA_PHOTO_SOURCE_ROOT=/Users/<user>/Movies/촬영
OLIVIA_PHOTO_WORK_ROOT=/Users/<user>/Movies/올리비아작업
OLIVIA_VIDEO_PYTHON=/Users/<user>/OliviaWorker/venv-video/bin/python
OLIVIA_FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
```

외장 SSD와 SD카드를 모두 탐색하려면 다음처럼 설정할 수 있다.

```dotenv
OLIVIA_PHOTO_SOURCE_ROOT=/Volumes
OLIVIA_PHOTO_WORK_ROOT=/Users/<user>/Movies/올리비아작업
```

`OLIVIA_PHOTO_SOURCE_ROOT`와 `OLIVIA_PHOTO_WORK_ROOT`는 같거나 서로 포함되는 경로면 안 된다. `/Volumes`를 입력으로 사용할 때 작업 결과는 반드시 맥북 내부 또는 입력과 겹치지 않는 별도 경로에 둔다.

## 5. OliviaWorker 앱 설치와 시작

공통 Worker 앱은 Mac Studio와 같은 실행 코드를 사용한다.

```zsh
cd ~/olivia-worker
./ops/mac-studio/OliviaWorker/build-and-install.sh
./ops/mac-studio/OliviaWorker/swap-launch-agents.sh
launchctl kickstart -k "gui/$(id -u)/com.olivia.macstudio.oliviaworker"
```

로그 확인:

```zsh
tail -f ~/OliviaWorker/logs/launch.err.log
```

`시작됨(worker=jake-macbookpro-01`이 보이면 정상이다. 영상 runner는 macOS에서 자동으로 `caffeinate -i`에 감싸져 분석 중 시스템 잠자기를 막는다.

## 6. 동작 확인

Olivia 영상작업실에서 `MacBook Pro`를 선택한다. 온라인 점이 켜지면 폴더 선택을 열어 맥북의 source root가 표시되는지 확인한다.

Worker를 한 번만 직접 폴링하려면:

```zsh
OLIVIA_WORKER_ONCE=1 ~/OliviaWorker/bin/worker.sh
```

MacBook Pro Worker는 `VIDEO_INTERVIEW_ANALYZE`, `VIDEO_AUDIO_EXTRACT`, `LIST_FOLDER`, `PING`만 실행한다. 사진 승인 및 NAS 사진 파이프라인은 계속 Mac Studio만 담당한다.
