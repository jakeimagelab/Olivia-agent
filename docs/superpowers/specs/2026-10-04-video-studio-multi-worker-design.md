# 영상작업실 다중 Worker 설계

## 목표

기존 Mac Studio Worker 기반 영상작업실에 MacBook Pro Worker를 추가한다. 영상작업실 사용자는 작업별 실행 컴퓨터를 선택하고, 선택한 Worker의 로컬 또는 연결 디스크에서 촬영 폴더를 탐색해 인터뷰 분석과 음성 분리를 실행할 수 있다.

기존 영상 분석 로직, 영상작업실 시각 디자인, 사진작업실 실행 위치 UI와 사진 파이프라인의 Mac Studio 전용 동작은 유지한다.

## Worker 식별과 인증

- 기본 Worker ID는 기존 `OLIVIA_WORKER_ID`, 없으면 `jake-macstudio-01`이다.
- `OLIVIA_WORKER_IDS`가 있으면 쉼표로 구분한 허용 Worker 목록으로 사용한다. 없으면 기본 Worker 하나만 허용한다.
- `OLIVIA_WORKER_TOKENS_JSON`에 해당 Worker의 토큰이 있으면 이를 우선한다. 없으면 기존 `OLIVIA_WORKER_TOKEN`을 공용 토큰으로 사용한다.
- `authorizeWorker(request)`는 Bearer 토큰과 `x-olivia-worker`를 함께 검증하고 성공한 Worker ID를 반환한다.
- `listConfiguredWorkerIds()`와 `isKnownWorkerId(id)`는 동일한 환경변수 해석 결과를 사용한다.
- 기존 단일 환경변수 배포는 동작이 달라지지 않는다.

## Worker API 격리

- `next`, `report`, `cancel-request`, `events`, `photo-scene-analysis`는 인증 결과의 Worker ID를 사용한다.
- claim, job report, cancel 조회, heartbeat는 인증된 Worker 자신의 행과 작업에만 적용한다.
- 다른 Worker가 소유한 job ID를 report하거나 cancel 조회하면 찾을 수 없는 작업으로 거부한다.
- 사진 승인 및 NAS 사진 파이프라인 claim RPC는 기본 Worker에서만 실행한다. MacBook Pro는 `claim_remote_job`으로 자기 대상 작업만 가져간다.
- event 본문의 `workerId`는 인증된 Worker와 일치해야 한다.

## 작업 생성 정책

- `/api/remote-jobs`는 명시된 `target_worker`를 허용 Worker 목록과 대조한다.
- MacBook Pro에 허용되는 action은 `VIDEO_INTERVIEW_ANALYZE`, `VIDEO_AUDIO_EXTRACT`, `LIST_FOLDER`, `PING`이다.
- 이 외 action을 비기본 Worker에 요청하면 400을 반환한다.
- `target_worker`가 없으면 기존 기본 Worker를 사용한다.

## 상태 API

- `/api/remote-workers/status?worker=<id>`는 지정 Worker 하나의 상태를 반환한다.
- 파라미터가 없으면 기존처럼 기본 Worker 상태를 반환한다.
- `?all=1`은 설정된 모든 Worker의 상태 배열을 반환한다.
- 미등록 Worker ID 요청은 400을 반환한다.
- DB 조회 실패 시 요청 형태와 같은 응답 구조로 각 Worker의 상태를 `unknown`으로 제공한다.

## 폴더 탐색

- `createRemoteWorkerNasDataSource({ targetWorker })`는 `LIST_FOLDER` 생성 요청에 `target_worker`를 포함한다.
- 대상 Worker가 없으면 기존 요청 body를 유지해 회귀를 방지한다.
- `PhotoSourcePicker`는 선택적 `targetWorker`를 받고, 선택값에 맞는 data source를 메모이제이션한다.
- MacBook Pro 선택 시 대화상자와 루트 표시는 `MacBook Pro` 기준으로 바꾼다. Mac Studio 기본 표시는 기존 동작을 유지한다.
- bridge의 `LIST_FOLDER`는 이미 각 Worker의 `OLIVIA_PHOTO_SOURCE_ROOT`를 기준으로 처리하므로 별도 파일 탐색 로직은 만들지 않는다.

## 영상작업실 UI와 상태 흐름

- 영상작업실 내부 작업 패널 상단에 `Mac Studio`와 `MacBook Pro` 세그먼트 선택기를 추가한다.
- 선택은 `olivia.video-studio.worker`에 저장하고 유효하지 않은 저장값은 기본 Worker로 되돌린다.
- `/api/remote-workers/status?all=1`을 처음 진입할 때와 10초마다 조회하며, 각 버튼에 온라인 상태를 표시한다.
- 선택 Worker ID를 폴더 선택과 작업 생성에 동일하게 전달한다.
- 오프라인 경고는 현재 선택한 컴퓨터 이름을 사용한다.
- 최근 작업과 진행 상태에는 `target_worker` 기반 실행 컴퓨터 배지를 표시한다.
- 프리미어/파이널컷 경로 안내에는 맥북에서 분석한 결과는 경로 치환 입력을 비워도 된다는 문구만 추가한다.
- 사진작업실의 `PhotoStudioExecutionContext`와 실행 위치 바는 수정하지 않는다.

## Worker 설치와 절전 방지

- 기존 Mac Studio 설치 파일과 동작은 유지한다.
- `ops/macbook`에 MacBook Pro 전용 설치 스크립트와 README를 추가한다.
- 설치본은 기존 `ops/mac-studio/bin`을 재사용하되 MacBook 전용 Worker 홈, 서비스 이름, 저장 경로를 명시한다.
- darwin에서 영상 runner를 실행할 때만 `caffeinate -i`로 감싸고, runner PID 종료와 함께 caffeinate도 끝나게 한다.
- `/Volumes`를 source root로 사용할 수 있으나 work root와 겹치지 않아야 함을 문서화한다.
- 처리 시간은 M1 Max 64GB와 M2 Max 32GB의 예상치로 명시하고 실측값으로 표현하지 않는다.

## 오류 처리

- 잘못된 Worker ID 또는 토큰은 401이다.
- 관리자 작업 생성에서 미등록 Worker 또는 MacBook 비허용 action은 설명이 포함된 400이다.
- 선택 Worker가 오프라인이어도 기존 큐 동작은 유지하며, 해당 컴퓨터가 켜지면 시작된다는 경고를 표시한다.
- 상태 조회 실패는 영상작업실 전체를 중단하지 않고 Worker 상태를 알 수 없음으로 표시한다.

## 테스트

- 단일 Worker 환경변수 하위 호환
- Worker별 전용 토큰과 공용 토큰 fallback
- 잘못된 ID와 토큰 거부
- MacBook이 자기 대상 job만 claim하고 사진 승인 RPC를 호출하지 않음
- 다른 Worker job report 및 cancel 조회 거부
- `target_worker` 등록 여부와 MacBook action allowlist 검증
- 상태 API의 기본, 특정 Worker, 전체 Worker 응답
- data source가 선택 Worker를 `LIST_FOLDER`에 전달하고 기본 호출은 기존 body 유지
- 영상작업실 작업 생성과 최근 목록의 `target_worker` 연결
- `npm run typecheck`, 변경 파일 lint, `npx vitest run`

## 비범위

- `lib/video-interview`의 분석·신호·Q&A·resolve·exporter 로직 변경
- 영상작업실 디자인 재구성
- 사진작업실 실행 위치 UI 변경
- DB 마이그레이션
- MacBook에서 사진 승인 또는 사진 분류 파이프라인 실행
