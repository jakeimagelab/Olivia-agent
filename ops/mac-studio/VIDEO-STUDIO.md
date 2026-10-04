# 영상작업실 › 인터뷰 분석 — Mac Studio 준비

영상작업실은 음성 인식(mlx-whisper)과 분석을 Mac Studio Worker에서 실행한다.
웹(Vercel)은 작업 요청과 결과 표시만 한다. 아래는 최초 1회 설정이다.

## 1. ffmpeg

```zsh
which ffmpeg || brew install ffmpeg
```

## 2. 음성 인식 전용 Python 환경

Worker 전용 venv를 만들어 시스템 Python과 섞이지 않게 한다.

```zsh
python3 -m venv ~/OliviaWorker/venv-video
~/OliviaWorker/venv-video/bin/pip install -U pip mlx-whisper numpy
# 모델 미리 받기 (약 1.6GB, 최초 1회)
~/OliviaWorker/venv-video/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/whisper-large-v3-turbo')"
```

## 3. 환경변수 (`~/OliviaWorker/config/worker.env`)

```dotenv
# 기본값으로 위 경로를 자동으로 찾지만, LaunchAgent PATH 문제를 피하려면 명시를 권장
OLIVIA_VIDEO_PYTHON=/Users/jakemacstudio/OliviaWorker/venv-video/bin/python
OLIVIA_FFMPEG_PATH=/opt/homebrew/bin/ffmpeg

# Claude 분석 키 — Worker repo의 .env.local에 이미 있으면 생략
ANTHROPIC_API_KEY=sk-ant-...

# 선택
# OLIVIA_VIDEO_INTERVIEW_MODEL=claude-sonnet-5        # 분석 모델
# OLIVIA_VIDEO_ASR_MODEL=mlx-community/whisper-large-v3-turbo
```

## 4. 반영

```zsh
cd ~/olivia-worker && git pull --ff-only origin main && npm ci
launchctl kickstart -k "gui/$(id -u)/com.olivia.macstudio.oliviaworker"
```

`scripts/mac-studio-remote-bridge.ts`에 `VIDEO_INTERVIEW_ANALYZE`, `VIDEO_AUDIO_EXTRACT`가 추가됐으므로
bridge 재시작이 필요하다.

## 5. 동작 확인 (Worker 없이 단독 실행)

```zsh
cd ~/olivia-worker
node --import tsx scripts/video-interview-runner.ts --action analyze \
  --source-relative-path "2026/1003_미소치과" --context "미소치과 원장 인터뷰"
```

- 입력: `OLIVIA_PHOTO_SOURCE_ROOT/<경로>` 바로 아래의 mp4·mov 등 (파일명 순서로 이어 붙임)
- 출력: `OLIVIA_PHOTO_WORK_ROOT/<경로>/인터뷰분석/` — `analysis.json`, `전체자막.srt`, `대본.txt`, `Q&A정리.md`
- 음성 분리: `--action extract-audio` → `OLIVIA_PHOTO_WORK_ROOT/<경로>/음성분리/*.wav` (24bit, 원본 샘플레이트)

## 처리 시간 (예상치)

아래 수치는 촬영 음질, 파일 수, Whisper 모델 캐시와 네트워크 상태에 따라 달라지는 예상 범위다. 실측 보장값이 아니다.

| 작업 컴퓨터 | 촬영 길이 | 음성 추출 | 음성 인식 | Claude 분석 |
|---|---:|---:|---:|---:|
| Mac Studio · M1 Max 64GB | 30분 | 약 1분 | 약 4~7분 | 약 1~2분 |
| Mac Studio · M1 Max 64GB | 1시간 | 약 2분 | 약 8~14분 | 약 2~3분 |
| MacBook Pro · M2 Max 32GB | 30분 | 약 1분 | 약 3~6분 | 약 1~2분 |
| MacBook Pro · M2 Max 32GB | 1시간 | 약 2분 | 약 7~12분 | 약 2~3분 |
