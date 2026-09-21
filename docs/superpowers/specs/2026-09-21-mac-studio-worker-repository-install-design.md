# Mac Studio Worker Repository Install Design

- 작성일: 2026-09-21
- 대상 저장소: `jakeimagelab/Olivia-agent`
- 대상 런타임: Mac Studio의 `~/OliviaWorker`

## 목적

리포지토리 밖 `~/OliviaWorker/bin`에만 존재하던 `worker.sh`와
`remote-bridge.sh`를 `ops/mac-studio/bin/`의 배포 원본으로 관리한다. 서버에서 이미
생성하는 PHASE 6 작업인 `PHOTO_PREPARE_SOURCE`, `PHOTO_STAGE_JPG`,
`PHOTO_CLASSIFY_WORK`를 기존 TypeScript runner에 연결하고, Mac Studio에서는 한 번의
설치 명령으로 기존 스크립트를 백업한 뒤 새 버전을 설치할 수 있게 한다.

현재 개발 머신에는 Mac Studio의 외부 스크립트 원본이 없으므로, 기존 파일을 그대로
가져오는 방식이 아니라 현재 서버 API와 runner 계약을 기준으로 호환되는 표준 버전을
리포지토리에 구성한다.

## 구조

```text
ops/mac-studio/
├── bin/
│   ├── worker.sh
│   └── remote-bridge.sh
├── git-hooks/
│   └── post-merge
├── install-worker-bin.sh
└── README.md
```

`~/OliviaWorker/config/worker.env`, 로그·상태 디렉터리, OliviaWorker.app의 실행 경로는
그대로 유지한다. 설치 후에도 앱은 기존처럼 `~/OliviaWorker/bin/*.sh`를 실행한다.

## worker.sh

`worker.sh`는 다음만 담당한다.

1. `~/OliviaWorker/config/worker.env` 로드
2. 필수 설정과 리포지토리 경로 검증
3. `/api/worker/next` 폴링
4. 수신한 job JSON을 `remote-bridge.sh`에 전달
5. bridge 종료 후 다음 job 폴링
6. 종료 신호를 현재 bridge 프로세스에 전달하고 정상 종료

인증은 기존 Worker 인증을 그대로 사용한다.

- `Authorization: Bearer $OLIVIA_WORKER_TOKEN` 또는 기존 별칭 `$WORKER_TOKEN`
- `x-olivia-worker: $OLIVIA_WORKER_ID` 또는 기존 별칭 `$WORKER_ID`
- Vercel 보호 우회 값이 있으면 기존 헤더 유지

서버 오류나 네트워크 오류는 로그에 실제 응답을 남기고 제한된 간격으로 재시도한다.

## remote-bridge.sh

bridge는 job 하나를 실행하고 `/api/worker/report`에 결과를 보고한다.

지원 액션은 현재 서버 `ALLOWED_ACTIONS`와 맞춘다.

- `PING`
- `COPY_TEST`
- `LIST_FOLDER`
- `PHOTO_SORT`
- `PHOTO_PREPARE_SOURCE`
- `PHOTO_STAGE_JPG`
- `PHOTO_CLASSIFY_WORK`
- `PHOTO_RAW_MATCH`
- `PHOTO_RESIZE`
- `PHOTO_AI_SELECT`
- `PHOTO_RETOUCH`

사진 작업은 새 파일 처리 로직을 만들지 않고 다음 기존 runner를 호출한다.

| 액션 | runner |
|---|---|
| `PHOTO_SORT` | `scripts/remote-photo-sort-runner.ts` |
| `PHOTO_PREPARE_SOURCE` | `scripts/photo-prepare-source-runner.ts` |
| `PHOTO_STAGE_JPG` | `scripts/photo-stage-jpg-runner.ts` |
| `PHOTO_CLASSIFY_WORK` | `scripts/photo-classify-work-runner.ts` |
| `PHOTO_RAW_MATCH` | `scripts/photo-raw-match-runner.ts` |
| `PHOTO_RESIZE` | `scripts/photo-resize-runner.ts` |
| `PHOTO_AI_SELECT` | `scripts/photo-ai-select-runner.ts` |
| `PHOTO_RETOUCH` | `scripts/photo-retouch-runner.ts` |

runner의 `OLIVIA_REMOTE_PROGRESS {json}` stderr 행은 `RUNNING` report로 전달한다. 최종
stdout JSON과 종료코드를 함께 검사한다. 실패 시 고정된 `작업 실패` 문구로 바꾸지 않고
다음 우선순위로 실제 원인을 서버에 보낸다.

1. runner 결과 JSON의 `error`
2. runner 결과 JSON의 `message`
3. stderr의 마지막 유효 오류
4. 종료코드가 포함된 명확한 fallback

지원하지 않는 액션, 유효하지 않은 payload, runner 누락도 각각 구체적인 오류로
`FAILED` 보고한다. 보고 API 자체가 실패하면 응답 코드와 본문을 로그에 남기고 bridge는
0으로 성공 종료하지 않는다.

## 설치와 롤백

`install-worker-bin.sh`는 다음 순서로 동작한다.

1. 실행 중인 리포지토리가 필요한 파일과 runner를 모두 보유하는지 검사
2. 대상 `~/OliviaWorker/bin`의 기존 파일을 타임스탬프 백업 디렉터리에 복사
3. 임시 디렉터리에 새 스크립트 복사
4. shell syntax와 실행 권한 검증
5. 동일 파일시스템 내 rename으로 대상 파일 교체
6. 설치된 버전과 백업 경로 출력

기존 `worker.env`, 로그, 상태 파일, LaunchAgent와 OliviaWorker.app은 변경하지 않는다.
설치 실패 시 기존 파일을 손대지 않으며, 설치 후 문제 발생 시 출력된 백업 경로에서
두 파일을 복원할 수 있다.

## Git 전환 안내

README에는 ZIP 복사본을 바로 삭제하지 않는 전환 절차를 제공한다.

1. 현재 ZIP 작업 폴더를 타임스탬프가 붙은 백업 이름으로 이동
2. 같은 경로에 GitHub 저장소 clone
3. 의존성 설치
4. worker bin 설치
5. foreground 또는 로그로 정상 동작 확인
6. 이후 `git pull --ff-only`과 installer 실행으로 갱신

워커 스크립트는 `~/OliviaWorker/bin`에 설치된 복사본이다. 최초 installer가 tracked
`post-merge` hook을 해당 clone의 `core.hooksPath`로 연결해, 이후 `git pull --ff-only`가
성공하면 installer를 자동 실행한다. 기존에 다른 `core.hooksPath`가 있으면 덮어쓰지 않고
`git pull --ff-only && ./ops/mac-studio/install-worker-bin.sh`를 안내한다. 심볼릭 링크는 경로
변경 시 런타임 전체가 깨질 수 있어 사용하지 않는다.

## 검증

- `zsh -n`으로 세 shell script 문법 검사
- fixture job을 사용해 PHASE 6 액션별 runner 인자 매핑 검사
- runner가 상세 오류 JSON을 반환할 때 report의 `error`가 그대로 유지되는지 검사
- runner가 비정상 종료하고 JSON이 없을 때 stderr와 종료코드가 보존되는지 검사
- 설치 테스트에서 기존 파일 백업, 새 파일 설치, 환경 파일 불변 확인
- `npm run typecheck`, `npm test`, `npm run build`

실제 NAS 파일 작업은 개발 머신에서 실행하지 않는다. 운영 Mac Studio에서는 설치 전
백업 경로를 확인하고 `PING` 또는 읽기 전용 `LIST_FOLDER`로 먼저 검증한다.
