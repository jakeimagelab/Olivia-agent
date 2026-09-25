# Olivia 3.0 Phase 2 — 문서 Core Command 설계

작성일: 2026-09-25

## 목표

견적, 계약, 콘티의 상태 변경을 `lib/core/commands/document.ts`의 Core Command로
단일화한다. 기존 `resolveQuoteWorkflowLink`, `completeOpenStepTasksForManualSave`,
`maybeAdvanceWorkflow`, `publishQuoteService`, `publishContractService`를 재사용하며,
새 워크플로우 상태 머신이나 새 이벤트 이름을 만들지 않는다.

이번 단계에서 새로 만드는 업무 기능은 확정 견적에서 실제 계약 레코드를 생성하는
`createContractFromQuote` 하나다. 나머지는 기존 기능을 얇은 Command로 감싸고,
조용한 실패를 호출 화면까지 전달하며, 직접 호출 경로를 제거하는 작업이다.

## 확인된 현행 문제

1. 고객 워크스페이스는 계약서 기초 자료로 확정 견적이 아닌 최신 견적 한 건을 선택한다.
2. 견적 `최종완료`는 워크플로우만 전진시키고 견적 상태를 `draft`로 남긴다. 따라서
   `published | final`만 계약서 생성에 사용할 수 있다는 규칙과 충돌한다.
3. 계약서 모달의 일부 실패 경로는 오류 상태를 사용자에게 충분히 설명하지 못한다.
4. 콘티 범용 공개 라우트는 워크플로우 전진 실패를 숨긴다.
5. 해당 콘티 공개 라우트는 현재 화면에서 호출되지 않는 고립된 경로다. API 응답만
   고쳐서는 사용자에게 전진 실패 사유가 표시되지 않는다.
6. Olivia 도구는 견적·계약 공개 서비스를 직접 호출해 UI와 별도의 진입점을 유지한다.
7. 워크플로우의 `contract_draft` task는 텍스트 output만 만들며 실제 `contracts` 행을
   생성하지 않는다.

## 검토한 접근

### 1. 얇은 Command 파사드와 기존 서비스 재사용 — 채택

`lib/core/commands/document.ts`가 문서 상태 변경의 유일한 업무 진입점이 된다. 기존
서비스는 내부 구현으로 유지하되 전진 결과를 반환하도록 최소 확장한다. API 라우트와
Olivia 도구는 Command만 호출한다.

장점은 기존 검증·고객 연결·포털 공개 로직을 유지하면서 직접 호출 경로와 조용한 실패를
동시에 없앨 수 있다는 점이다. 이번 범위에 가장 작고 회귀 위험이 낮다.

### 2. 라우트를 유지하고 Command가 내부 HTTP API를 호출

코드 이동은 적지만 서버 내부 HTTP 왕복이 생기고, 라우트와 도구가 여전히 서로 다른
오류 형식을 갖는다. 업무 로직의 단일 진입점도 보장하지 못하므로 채택하지 않는다.

### 3. 견적·계약·콘티 공통 상태 머신 신규 구축

형식은 통일되지만 기존 `workflowAutomation`과 `pcrm_publications` 위에 또 다른 상태
계층이 생긴다. Phase 1 원칙과 정면으로 충돌하므로 채택하지 않는다.

## Command 경계와 반환 규칙

Phase 1에서 확정한 `CoreCommandResult<T>`를 그대로 사용한다.

```ts
type CoreCommandResult<T> =
  | { ok: true; value: T; idempotent?: boolean }
  | { ok: false; reason: string; code?: string };
```

Phase 2에서 별도의 평면형 결과 union을 만들지 않는다. API 라우트는 기존 클라이언트
호환을 위해 성공 결과의 `value`를 JSON 최상위에 펼칠 수 있지만, Core 내부 반환 형식은
하나만 유지한다.

모든 Command는 다음 원칙을 따른다.

- 입력 검증 실패 시 DB를 변경하지 않는다.
- 부분 성공을 성공으로 반환하지 않는다.
- 기존 예외를 `coreCommandFailure`로 변환해 사유를 보존한다.
- 호출 UI는 `reason` 또는 전진 보류 사유를 반드시 표시한다.
- 워크플로우 전진은 기존 `maybeAdvanceWorkflow`만 사용한다.

## 견적 확정 의미

확정 견적 상태는 `published` 또는 `final`이다.

- `publishQuote`: 고객 포털에 공개하며 기존처럼 `published`로 저장한다.
- `completeQuote`: 대표가 누른 내부 최종완료이므로 워크플로우 전진이 성공하거나
  `current_step_changed`로 이미 해당 단계를 지난 것이 확인된 경우 견적을 `final`로
  저장한다. `open_items`로 전진이 보류되면 `draft`를 `final`로 바꾸지 않는다.

이 보완이 없으면 포털에 공개하지 않고 내부 최종완료만 한 견적은 계속 `draft`로 남아
계약서를 생성할 수 없다. 상태 저장 후 행을 다시 조회해 `status`, `client_id`,
`workflow_run_id`를 검증한다. 고객 연결이나 열린 task 검증은 기존 함수가 담당한다.

## Command 상세

### `completeQuote(quoteId, overrides?)`

1. 견적을 조회한다.
2. `resolveQuoteWorkflowLink`로 고객과 워크플로우를 연결한다.
3. 확인이 필요한 유사 고객은 `AMBIGUOUS` 실패로 반환한다.
4. `completeOpenStepTasksForManualSave`를 호출한다.
5. `maybeAdvanceWorkflow(db, workflowRunId, "quote")`를 호출한다.
6. 전진 성공 또는 이미 단계가 바뀐 경우에만 견적 상태를 `final`로 저장하고 재조회
   검증한다. `open_items`이면 상태를 바꾸지 않고 보류 사유를 반환한다.
7. 기존 PCRM 완료 활동을 기록한다.

반환 값은 `clientId`, `workflowRunId`, `advanced`, `advanceReason`을 포함한다.

### `publishQuote(quoteId, overrides?)`

기존 `publishQuoteService`를 호출한다. 서비스는 기존 동작을 유지하고
`maybeAdvanceWorkflow` 결과의 `advanced`, `reason`을 반환 값에 추가한다. Command는
예외를 Core 실패 결과로 변환한다.

### `createContractFromQuote(quoteId)`

1. 견적 전체 행을 조회한다.
2. 상태가 `published | final`인지 검증한다.
3. `client_id`와 `workflow_run_id`가 있는지 검증한다.
4. 같은 `workflow_run_id`의 기존 계약이 하나라도 있으면 중복 생성하지 않고 기존
   `contractId`와 함께 `CONTRACT_EXISTS` 실패를 반환한다.
5. `normalizeContractQuoteData(quote, quote)`로 계약서 snapshot을 만든다.
6. `contracts`에 `client_id`, `workflow_run_id`, `source_quote_id`, `quote_data`와 현재
   계약 기본 필드를 저장한다.
7. 저장 행을 재조회해 출처·고객·워크플로우 연결을 검증한다.
8. 기존 `logPortalEvent`의 `contract_ready` 이벤트를 catch로 숨기지 않고 기록한다.

계약 생성은 문서 생성일 뿐 단계 전진이 아니다. `maybeAdvanceWorkflow`를 호출하지 않는다.

### `publishContract(contractId, { finalize, ...link })`

기존 `publishContractService`를 호출한다. 서비스는 공개·포털·task 완료·전진·재조회
검증을 그대로 유지하고, 전진 결과를 반환한다. Command는 성공 여부와 전진 결과를
표준 결과로 감싼다.

### `publishConti(contiId, input)`

현재 범용 공개 라우트의 콘티 공개 로직을 재사용 가능한 서버 함수로 추출한다.
Command는 콘티가 전달된 고객·워크플로우에 실제로 연결돼 있는지 확인한 뒤 다음을
수행한다.

1. 기존 `pcrm_publications` 버전 규칙으로 공개 이력을 저장한다.
2. 고객 포털 접근을 확인한다.
3. `completeOpenStepTasksForManualSave(..., "conti")`를 호출한다.
4. `maybeAdvanceWorkflow(..., "conti")` 결과를 보존한다.
5. 기존 PCRM 활동을 기록한다.

task 완료나 전진 중 예외가 발생하면 공개 성공만 반환하지 않고 Command 전체를 실패로
반환한다. 열린 승인 항목 때문에 정상적으로 전진이 보류된 경우에는 성공 결과 안에
`advanced: false`, `reason: "open_items"`를 담는다.

## 확정 견적 선택과 계약서 UI

`GET /api/clients/[id]/workspace`는 독립 조회를 기존 `Promise.all` 안에서 병렬로 실행한다.

- 확정 견적 최신 한 건: `status in ('published', 'final')`
- 전체 견적 최신 한 건: 확정 견적이 없을 때만 결과 선택에 사용하는 fallback

두 쿼리는 순차 waterfall을 만들지 않는다. 최종 응답은 다음 정보를 포함한다.

```ts
resourceIds: { quote: string | null; ... }
resourceMeta: {
  quote: null | { status: string; isApproved: boolean };
}
```

`ContractBuilder`는 워크스페이스 경로와 `sourceQuoteId` 경로 모두 견적 상태를 확인한다.
확정 견적이면 정상적으로 계약 초안을 채운다. 확정 견적이 없으면 최근 초안으로
미리보기를 채우되 다음 경고를 고정 표시한다.

> 확정된 견적이 없어 최근 초안으로 채웠습니다. 금액을 확인해주세요.

Core 자동 생성은 초안을 거부한다. 사용자가 경고를 확인한 뒤 수동으로 저장하는 기존
편집 경로는 유지하며 `source_quote_id`를 기록해 출처를 숨기지 않는다. 따라서 기계 검증의
“확정 견적에서 생성” 조건은 `createContractFromQuote`로 생성된 계약에 적용된다.

계약 로드 실패, 고객 미지정, 워크스페이스 실패, 견적 fetch 실패는 모두 `error` 상태를
설정한다. 로딩 화면은 반드시 문서 표시 또는 사유 표시 중 하나로 종료된다. 일반 이벤트
guard의 조기 return까지 광범위하게 바꾸지 않고, 계약서 데이터 로딩 effect와 Promise
catch 경로만 대상으로 한다.

## 데이터베이스 변경

additive migration으로 다음을 추가한다.

```sql
alter table public.contracts
  add column if not exists source_quote_id uuid
  references public.quotes(id) on delete set null;

create index if not exists idx_contracts_source_quote_id
  on public.contracts(source_quote_id)
  where source_quote_id is not null;

create unique index if not exists uq_contracts_core_workflow_run
  on public.contracts(workflow_run_id)
  where workflow_run_id is not null and source_quote_id is not null;
```

부분 unique index는 Core가 새로 생성하는 출처 추적 계약끼리의 동시 중복 생성을 DB에서도
막는다. `source_quote_id`가 없는 과거 계약은 인덱스 대상이 아니므로 기존 데이터를
삭제하거나 마이그레이션하지 않는다. Command의 사전 조회는 출처 여부와 관계없이 같은
워크플로우의 기존 계약을 찾아 과거 계약과의 논리 중복도 막는다.

계약 생성 insert가 unique 충돌을 만나면 다시 기존 계약을 조회해 “이미 계약서가 있습니다”와
`contractId`를 반환한다. 이를 일반 DB 장애로 숨기지 않는다.

## 호출 경로 전환

다음 라우트는 인증·입력 파싱·HTTP status 변환만 담당한다.

- `POST /api/quotes/[id]/complete` → `completeQuote`
- `POST /api/quotes/[id]/publish` → `publishQuote`
- `POST /api/contracts/[id]/publish` → `publishContract`
- `POST /api/publications/by-type/conti/[id]/publish` → `publishConti`

Olivia v2 견적·계약 tool executor도 공개 서비스를 직접 호출하지 않고 같은 Command를
사용한다. Hermes MCP는 기존 도구/라우트 계층을 통해 자동으로 같은 경로를 사용한다.

범용 publication 라우트의 콘티 이외 자료는 현행 방식을 유지한다. 고객관리에서 콘티를
공개하는 UI는 관리자 범용 publication POST가 아니라 Command-backed 콘티 API를 호출하고,
응답의 `advance`를 표시한다. 현재 고립된 콘티 공개 라우트가 실제 사용자 동작과 연결된다.

`maybeAdvanceWorkflow` 전체 grep 결과에는 사진 파이프라인, workflow task executor,
일반 workflow API 같은 정당한 호출이 남는다. 완료 검사는 전체 저장소 0건이 아니라
견적·계약·콘티 문서 변경 경로에서 `lib/core/commands/document.ts` 외 직접 호출이 0건인지
allowlist 방식으로 확인한다.

## 오류 표시

API는 Core 결과를 다음과 같이 매핑한다.

- `NOT_FOUND`: 404
- `AMBIGUOUS` 또는 확인이 필요한 고객 연결: 409
- `BLOCKED`, `UNAPPROVED_QUOTE`, `CONTRACT_EXISTS`: 400 또는 409
- 그 외 실행 실패: 500

UI는 다음을 구분한다.

- 계약서 로드 자체 실패: 문서 대신 복구 가능한 오류 화면
- 초안 견적 fallback: 문서는 보이되 상단 경고
- 콘티 공개는 성공했지만 전진 보류: 공개 성공과 보류 사유를 함께 표시
- 콘티 공개/전진 실행 실패: 성공 문구를 표시하지 않고 실패 사유 표시

## 테스트

### 순수/서비스 테스트

- 확정 견적 선택 helper가 `published/final`을 최신 초안보다 우선한다.
- 확정 견적이 없으면 최신 초안과 `isApproved: false`를 반환한다.
- `completeQuote`가 링크·task 완료·전진 뒤 상태를 `final`로 검증한다.
- `createContractFromQuote`가 draft를 거부하고 DB를 변경하지 않는다.
- 확정 견적으로 계약을 만들고 `source_quote_id`를 보존한다.
- 같은 workflow에 두 번째 생성 요청을 하면 기존 `contractId`와 함께 실패한다.
- 동시에 발생한 신규 생성은 부분 unique index로 한 건만 성공한다.
- 계약 생성은 워크플로우 단계를 전진시키지 않는다.
- quote/contract publish Command가 서비스의 전진 결과를 보존한다.
- conti 공개의 `open_items`와 실행 예외가 서로 다른 결과로 전달된다.

### 라우트 및 UI 회귀 테스트

- Quote/Contract/Conti API가 Command 오류 code를 적절한 HTTP status로 변환한다.
- 고객 워크스페이스 응답에 `resourceMeta.quote`가 포함된다.
- 계약서 모달이 초안 fallback 경고를 표시한다.
- 고객 ID·workspace·견적 조회 실패 시 spinner가 영구 유지되지 않는다.
- 콘티 공개 보류/실패 사유가 고객관리 화면에 표시된다.
- Olivia quote/contract 도구가 직접 publication service를 호출하지 않는다.

### 전체 검증

```bash
npm run typecheck
npm test
npm run build
```

프로덕션 수동 확인은 Hermes를 끈 상태에서도 UI의 견적 최종완료가 견적을 `final`로 만들고
계약 단계로 전진하며, 그 확정 견적에서 계약 생성이 되는 흐름을 포함한다.

## 제외 범위

- `lib/assistant/core/oliviaCore.ts`, `legacyOliviaCore.ts` 수정
- 새 워크플로우 단계 또는 상태 머신 추가
- 이벤트 이름의 대문자/언더바 체계로 변경
- 사진 파이프라인 상태 머신 변경
- 견적 고객 매칭 알고리즘 변경
- 계약 생성 시 워크플로우 단계 전진
- 과거 계약 데이터 삭제·병합·강제 backfill
