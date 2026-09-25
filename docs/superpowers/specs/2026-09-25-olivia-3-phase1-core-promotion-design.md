# Olivia 3.0 Phase 1 — 기존 Core 승격 설계

## 목표

새 상태 머신을 만들지 않는다. `lib/workflow.ts`, `lib/workflowAutomation.ts`, `lib/olivia/events.ts`와 기존 사진 상태 머신을 그대로 진실 공급원으로 유지하면서, 이를 우회하는 쓰기 경로를 제거한다. 문서·미션바·채팅의 고객 컨텍스트를 하나로 연결하고, 실패와 Core 우회를 운영 화면에서 즉시 확인할 수 있게 한다.

`lib/assistant/core/oliviaCore.ts`와 `lib/assistant/core/legacyOliviaCore.ts`는 채널 어댑터이므로 수정하지 않는다. 새 경계가 필요한 코드는 `lib/core/commands/`에만 둔다. 이벤트 이름은 기존 소문자 점 표기법을 유지한다.

## 구현 순서

Phase 1은 한 번에 갈아엎지 않고 아래 네 수직 단위로 진행한다. 각 단위마다 관련 테스트를 먼저 통과시킨 뒤 다음 단위로 넘어간다.

1. Workflow 단계·상태 변경 경로와 이벤트
2. 문서·미션바·채팅 Context
3. 사진 상태 머신의 Command 진입점
4. 정합성 진단과 조용한 실패 제거

## 1. Workflow 단계 변경 경로 단일화

`advanceWorkflow()`를 단계 변경의 유일한 엔진으로 유지한다. 다음 직접 업데이트를 제거한다.

- 고객 포털 최종 승인: 현재 단계를 읽고 `final_delivery` 또는 `revision`에서 `reward`로 전진한다.
- RAW 매칭 완료: 기존 데이터 호환을 위해 현재 단계가 `client_selection` 또는 `raw_matching`인지 확인하고 실제 현재값을 `from_step_key`로 넘겨 `retouching`으로 전진한다.
- 사진 분류 결과로 셀렉 갤러리 생성: `backup_sorting`에서 `client_selection`으로 전진한다. 이미 전진한 동일 요청은 명시적인 idempotent 결과로 처리한다.
- 고객 셀렉 제출: `client_selection`에서 내부 단계 `raw_matching`으로 전진한다. 화면 표시는 기존 `INTERNAL_STEP_GROUPS` 정규화를 그대로 사용한다.

직접 update 제거 여부는 줄 배치에 의존하는 grep 대신 소스 회귀 테스트로 고정한다. 신규 workflow run의 `insert`/`upsert` 경로는 단계 변경과 구분해 허용 목록으로 관리한다.

### 취소와 고객 재연결

`workflowAutomation.ts`에 `cancelWorkflow()`를 추가한다. 현재 상태를 확인하고 active/paused run만 canceled로 바꾼 뒤 `workflow.canceled` 이벤트를 남긴다. 이미 취소된 run은 idempotent 성공으로, 완료된 run의 취소처럼 허용하지 않는 전이는 실패로 반환한다.

고객 연결 자가복구는 기존 동작을 유지하되, 실제 `client_id`가 바뀐 경우 `workflow.client_relinked` 이벤트를 남긴다. 이벤트 payload에는 이전·새 client ID와 복구 사유만 넣고 민감 정보는 넣지 않는다.

### Command 결과

새 Core 경계의 외부 반환은 다음 판별 유니온으로 통일한다.

```ts
type CoreCommandResult<T> =
  | { ok: true; value: T; idempotent?: boolean }
  | { ok: false; reason: string; code?: string };
```

검증은 쓰기 전에 수행한다. DB 쓰기나 필수 이벤트 기록이 실패하면 성공을 반환하지 않는다. 현재 Supabase 호출은 여러 테이블을 하나의 DB 트랜잭션으로 묶지 않으므로, 드문 중간 실패는 정합성 점검에서 `core_bypass_suspected`로 노출한다. 이번 Phase에서는 별도 SQL 상태 머신이나 대형 RPC를 만들지 않는다.

## 2. 단계 변경 이벤트와 정합성 진단

다음 원칙을 코드 주석과 설계에 고정한다.

> `workflow_runs.current_step_key` 또는 `status`가 바뀌었는데 대응하는 `olivia_events` 행이 없으면 Core 우회 버그다.

기존 `workflow.step_changed`, `workflow.completed`, `quote_ready`를 유지하고 `workflow.canceled`, `workflow.client_relinked`만 추가한다.

`findWorkflowConsistencyIssues()`는 기존 문서/갤러리 증거 불일치와 함께 `kind`가 있는 판별 유니온을 반환한다.

- `resource_ahead`: 문서·갤러리는 존재하지만 workflow 단계가 뒤에 있음
- `core_bypass_suspected`: 최근 7일 내 run의 `updated_at` ±5초에 `workflow.step_changed`, `workflow.completed`, `workflow.canceled`, `workflow.client_relinked` 중 대응 이벤트가 없음

기존 정합성 위젯은 두 종류를 함께 표시하되, `지금 완료 처리`는 `resource_ahead`에만 제공한다. Core 우회 의심은 진단 정보와 관련 고객/프로젝트 링크만 표시한다.

상단 오른쪽 `상태 및 알림` 패널의 기존 API 응답에 정합성 요약을 추가한다. 패널에는 우회 의심 건수와 대상 프로젝트를 표시하며, 같은 `findWorkflowConsistencyIssues()` 결과를 재사용해 별도 판정 로직을 만들지 않는다.

## 3. Context Resolver

### 원자적 문서 컨텍스트 설정

`setCurrentDocument()`를 다음과 같이 확장한다.

```ts
setCurrentDocument(
  id,
  type,
  title,
  link?: {
    clientId?: string;
    clientName?: string;
    projectId?: string;
    projectName?: string;
  },
)
```

link가 있으면 문서·고객·프로젝트 값을 하나의 Zustand `set()`에서 갱신하고 revision도 한 번만 증가시킨다. link에 없는 필드는 기존 값을 임의로 지우지 않는다. 동일 scalar 값이면 새 상태를 만들지 않는다.

견적서, 계약서, 콘티, 모바일 문서 미리보기는 리소스 DB 응답 또는 명시적 props에서 얻은 정확한 link를 넘긴다. 특히 계약서는 `contracts.client_id`, `contracts.workflow_run_id`, 병원명을 사용해 이전 고객 컨텍스트가 남지 않게 한다.

### 미션바 소유권

미션바는 추천/우선 프로젝트를 보여주는 읽기 전용 카드다. fetch 완료만으로 active client/project를 바꾸지 않는다.

- 현재 채팅 대상과 미션의 고객이 다르면 `추천 미션 · 현재 채팅 대상과 다름`을 표시한다.
- 사용자가 카드 또는 상세 버튼을 클릭할 때만 해당 client/project를 한 번에 설정한다.
- 전환 후 기존 상세 화면 이동은 유지한다.

### 채팅 대상 표시와 실행 가드

Hermes runtime이 최종 사용한 client/project를 `message_complete` 메타데이터로 내려보낸다. 대화 store는 이 값을 Olivia context store에 반영하고, `OliviaChatContextBanner`는 항상 다음 중 하나를 표시한다.

- `지금 대상: 여의도기통찬의원`
- `지금 대상: 선택되지 않음`

대상 미지정 실행 가드는 고객 스코프가 필수인 요청에만 적용한다. 견적·계약·콘티·고객 워크플로·고객 갤러리 변경은 대상을 되묻고 실행하지 않는다. 캘린더, 일반 메모, 화면 열기·닫기, NAS 사진 폴더 작업은 고객 없이도 기존대로 실행한다.

고객 스코프 실행에서는 대화 이력의 최근 resource만으로 client를 추론하지 않는다. reply metadata 또는 현재 화면 snapshot처럼 사용자가 명시적으로 확정한 컨텍스트만 허용한다. 일반 대화와 명시적 과거 문서 후속 참조는 기존 work session 복원 동작을 유지한다.

## 4. 사진 Command 경계

사진 상태 값과 승인 조건은 그대로 둔다. `lib/core/commands/photo.ts`는 기존 구현을 호출하는 얇은 진입점만 제공한다.

- `approveSourceSeparation(projectId)`: 기존 READY/DEFERRED → MERGE_APPROVED 로직 재사용
- `approveClassification(projectId)`: 기존 진료과·촬영모드 검증과 MERGE_COMPLETED → CLASSIFY_APPROVED 로직 재사용
- `completeSceneSort(projectId)`: 기존 분류 완료 동기화와 `advanceWorkflow()` 재사용
- `registerGalleryLink(projectId, url)`: 기존 `registerOriginalDeliveryLink()` 재사용 후 `gallery_ready` 이벤트 기록

approve API의 상태 검증과 mutation은 공용 함수로 이동하고 route는 인증·입력 파싱·HTTP 매핑만 담당한다. 브라우저 route를 서버 내부에서 다시 HTTP 호출하지 않는다.

## 5. 조용한 실패 제거

전역의 모든 조기 return을 오류로 바꾸지 않는다. 캔버스 포인터, 키보드, 모달 종료, effect 비활성화 같은 정상 가드는 유지한다. 다음 사용자 영향 경로만 대상으로 한다.

- 데이터가 없어 로딩 상태가 끝나지 않는 경우
- Core Command 실패를 숨기는 경우
- 견적서·계약서·콘티·사진 진행 작업이 실패했는데 이유를 표시하지 않는 경우

`ContractBuilder` modal에서 resource, source quote, client 중 어느 입력도 없으면 즉시 로딩을 종료하고 `계약서에 연결된 고객이나 견적서가 없습니다.`를 표시한다. API 응답의 `ok: false`와 `reason`은 각 UI의 기존 오류 영역에 표시한다.

## 오류 처리 원칙

- 검증 실패는 mutation 전에 반환한다.
- Core Command는 `ok: true` 또는 `ok: false, reason`만 외부에 반환한다.
- 필수 이벤트 기록 실패를 경고만 남기고 성공으로 바꾸지 않는다.
- idempotent 재요청은 성공과 구분 가능한 `idempotent: true`로 반환한다.
- UI는 `reason`을 사용자에게 표시한다.
- Hermes 장애 폴백 정책은 이번 Phase에서 변경하지 않는다.

## 테스트와 완료 판정

### 자동 테스트

- 직접 `current_step_key` update 금지 회귀 테스트와 허용된 신규 run 생성 경로 목록
- 네 우회 경로의 `advanceWorkflow()` 호출, from-step 가드, task/step run/event 생성
- cancel과 relink 이벤트 및 idempotency
- 최근 7일 ±5초 이벤트 누락 진단
- `setCurrentDocument()`의 단일 revision, 동일값 no-op, 문서 간 고객 전환
- 미션바 fetch가 컨텍스트를 자동 변경하지 않고 클릭만 전환하는 동작
- 고객 필수 요청과 고객 불필요 요청의 실행 가드
- 사진 Command의 승인 조건 재사용과 실패 반환
- ContractBuilder 입력 누락 시 무한 로딩 방지

### 검증 명령

```bash
npm run typecheck
npm test
npm run build
```

프로덕션 코드 검색으로 `workflow_runs.current_step_key` 직접 update가 `workflowAutomation.ts` 밖에 남지 않았는지 확인한다. 신규 run 생성은 기존 허용 목록만 남긴다.

### 수동 확인

- 견적서·계약서·콘티 각각을 열어 채팅 대상 고객과 일치하는지 확인
- 미션바 고객이 다를 때 구분 문구가 보이고 클릭 전에는 채팅 대상이 바뀌지 않는지 확인
- 고객 미지정 상태에서 견적 승인 요청은 되묻고, 일정 등록·팝업 닫기·사진 폴더 작업은 동작하는지 확인
- Hermes를 꺼도 UI의 기존 견적 완료 버튼이 workflow를 전진시키는지 확인
- 상단 상태 패널과 정합성 위젯이 같은 Core 우회 의심 결과를 표시하는지 확인

## 비범위

- 새 workflow 단계 또는 새 사진 상태 추가
- `ACTIVE_WORKFLOW_STEP_KEYS` 재정의
- 사진 상태 머신과 workflow 상태 머신 통합
- 이벤트 이름의 대문자/언더바 변환
- 기존 assistant core 또는 Hermes/MCP 연결 변경
- 모든 React 조기 return의 일괄 변경
- 견적→계약→콘티 전체 Command 전환과 Worker 확대는 Phase 2 이후로 남긴다.
