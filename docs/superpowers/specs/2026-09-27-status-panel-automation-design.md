# 상태표시줄 자동화 설계

작성일: 2026-09-27

## 목표

상태표시줄을 단순 상태 목록에서 안전한 작업 진입점으로 바꾼다. 자동 실행과 수동 실행은 기존 사진 프로젝트 API를 공유하며, 모든 링크는 관련 폴더나 고객을 직접 연다. 상태패널 자체의 실패는 Olivia Desktop 전체에 전파되지 않는다.

## 현재 구조와 요청서 차이

현재 API는 요청서의 여덟 원시 필드를 그대로 반환하지 않는다.

- `recentBackups`와 `recentJobs`는 `recentActivity`로 합쳐져 있다.
- `coreBypassIssues`, `consistencyError`, `hermesFallbackCount24h`는 `panelIssues`로 정규화된다.
- `mcp`, `worker`, `schemaWarnings`는 `diagnostics.items`에 들어 있다.
- 사용자 행동과 실행 상태는 `myTurn`, `progress`로 나뉜다.

이 정규화 구조는 유지하고, 실행에 필요한 프로젝트 ID, 이벤트 ID, 폴더 경로, 실패 이력, SQL 원문과 버튼 정의를 항목 메타데이터로 보강한다.

## 안전 결정

백업 자동 승인은 이번 작업에서 수행하지 않는다.

현재 `worker_events`는 `event_type=BACKUP_READY`, `status=PENDING`으로 저장되고 이벤트 등록 시 같은 폴더의 `photo_storage_projects` 행을 이미 `READY`로 만든다. 따라서 “같은 이름 프로젝트가 없어야 한다”는 원래 조건을 그대로 적용할 수 없다. 또한 승인 후 Worker가 즉시 프로젝트를 가져갈 수 있지만 기존 API에는 확실한 취소·롤백 기능이 없다. `되돌리기` 없는 자동 실행을 금지한다는 상위 안전 규칙에 따라 백업은 줄에서 `[승인] [미루기] [열어보기]`로 처리한다.

MCP도 서버 프로세스를 재시작하거나 연결을 강제하는 기존 API가 없다. 따라서 `확인 불가` 상태만 30초 후 한 번 재조회하며, 실제 재시작 동작은 추가하지 않는다.

## 서버 데이터 모델

`collectSystemStatus()`는 연결 진단의 단일 소스로 유지한다. `collectStatusPanelData()`는 팝업 전용 데이터만 추가한다.

- 사진 프로젝트: 파일 수, 현재 상태, 폴더 경로, 연결된 Worker 이벤트를 포함한다.
- 원격 잡: `progress`, 오류, 프로젝트 ID, 폴더 경로를 포함한다.
- 실패 이력: 동일 프로젝트와 작업의 실패 횟수를 계산한다. 최초 실패이면서 네트워크 계열 오류인 경우에만 자동 재시도 후보로 표시한다.
- Hermes 폴백: 최근 24시간 횟수와 사유 상위 3개를 집계한다.
- SQL 경고: 진단이 가리키는 저장소 내 migration만 읽어 SQL 원문을 제공한다. 임의 경로는 읽지 않는다.
- Worker: `collectSystemStatus()`의 Worker·마운트·권한·감지기 항목을 묶어 원인까지 표시한다.

응답 필드는 모두 선택적으로 취급하고, 누락되거나 형태가 틀린 응답은 빈 배열과 `확인 안 됨` 값으로 정규화한다.

## 클라이언트 동작

항목은 최대 세 개의 액션을 가진다.

- 승인: 기존 `POST /api/photo-storage/projects/[id]/approve`
- 미루기: 기존 `POST /api/photo-storage/projects/[id]/defer`
- 재시도: 기존 `POST /api/photo-storage/projects/[id]/retry`
- 완료: 기존 `POST /api/photo-storage/projects/[id]/complete`
- 열기: `/photo-sorting?remoteFolder=<경로>` 또는 `/clients?clientId=<id>`
- SQL 복사: 응답에 포함된 SQL 원문을 클립보드로 복사
- Supabase 열기: 기존 외부 콘솔 URL이 설정된 경우에만 노출

액션 성공 후 상태와 사진 프로젝트 알림을 다시 읽는다. 실패는 해당 줄에만 표시하며 패널 밖으로 예외를 던지지 않는다.

실패 원격 잡은 오류 문구가 DNS·연결 거부·타임아웃 등 일시적 네트워크 오류이고 동일 프로젝트·작업의 실패가 한 건일 때만 기존 retry API를 한 번 자동 호출한다. 클라이언트 세션에서도 같은 항목을 중복 호출하지 않도록 처리 중 ID를 기억한다.

`consistencyError` 성격의 조회 실패와 MCP `unknown`은 첫 응답 직후 30초 뒤 한 번만 자동 재조회한다. 재조회 전에는 사람에게 경고하지 않고, 두 번째에도 실패한 경우에만 표시한다.

## 단계 문구와 대상 링크

워크플로 단계 설명은 기존 `STEP_INFO`를 공용 모듈로 이동해 고객관리와 상태패널이 함께 사용한다. 앱 경로는 `STEP_APP_LINKS`와 기존 링크 빌더를 사용한다.

사진 항목에는 항상 폴더명, 현재 단계, 상대 시각을 표시한다. 사진 및 잡 링크에는 `remoteFolder`를 넣어 사진작업실이 대상 폴더를 바로 연다. 고객 정합성 링크는 기존 `clientId` 딥링크를 유지한다.

원격 잡 진행률은 기존 progress JSON의 stage/current/total/message를 사용하며, 단계명과 `current/total`을 한 줄에 표시한다.

## 장애 격리

`StatusPanelButton`만 감싸는 전용 Error Boundary를 `DesktopTopBar`에 둔다. 렌더 오류가 발생하면 조용한 상태 버튼 대체 UI만 표시하고 Desktop Shell은 유지한다. 오류는 기존 진단 로거에 남긴다.

API 응답 정규화 함수는 다음 최상위 키가 각각 빠진 경우를 모두 허용한다.

- worker 진단
- 최근 백업
- 최근 잡
- Core 정합성 문제
- 조회 오류
- Hermes 폴백
- MCP 진단
- SQL 경고

## 검증

- 응답 키 누락 8개 회귀 테스트
- 일시적 오류 분류와 최초 실패만 재시도하는 테스트
- 사진 딥링크가 `remoteFolder`를 포함하는 테스트
- 줄 액션이 기존 API만 호출하는 테스트
- SQL 경로 제한 및 복사 데이터 테스트
- Error Boundary가 자식 오류를 Desktop Shell로 전파하지 않는 구조 검사
- `npm run typecheck`, `npm test`, `npm run build`

