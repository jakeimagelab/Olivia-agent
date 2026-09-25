# Olivia 3.0 Phase 5.2 — Core Snapshot과 UI/Chat 상태 동기화 설계

## 목표

Phase 5/5.1에서 확립한 `workflow_run_id` 기반 Core 상태를 계약서·콘티 UI, Olivia Page Context, 채팅 응답의 단일 읽기 기준으로 사용한다. Core Snapshot은 실제 업무 상태의 진실 공급원이고 Context Store는 사용자가 현재 보고 있는 위치만 표현한다.

이번 변경은 새 업무 기능이나 상태 머신을 추가하지 않는다. 완료·공개 Command, Resource Registry, Project Snapshot, Workflow Engine의 검증 원칙은 유지한다.

## 데이터 흐름

1. `useCoreProjectSnapshot(workflowRunId)`가 기존 Snapshot API만 호출한다.
2. 계약서·콘티 화면은 exact resource ID와 Snapshot을 순수 helper로 비교해 완료 상태를 계산한다.
3. Desktop 또는 Chat에서 Core mutation이 성공하면 `olivia-core-snapshot-updated` 이벤트를 보낸다.
4. 같은 `workflowRunId`를 보고 있는 hook만 Snapshot을 다시 읽는다.
5. 버튼, Page Context, 채팅 문구는 새 Snapshot 결과를 반영한다.

이벤트는 캐시 무효화 신호일 뿐 데이터 원본이 아니다. 이벤트 detail이나 로컬 상태를 업무 상태로 신뢰하지 않는다.

## Snapshot client hook

`lib/core/client/useCoreProjectSnapshot.ts`는 `GET /api/core/workflows/{id}/snapshot`을 `cache: "no-store"`로 호출한다. workflow ID가 없으면 요청하지 않는다. ID 변경, 동일 ID의 invalidation event, 명시적 `refresh()`에서 재조회한다.

각 요청은 이전 `AbortController`를 취소하고 요청 순번을 확인해 오래된 결과가 새 프로젝트 상태를 덮어쓰지 못하게 한다. API가 돌려준 오류 이유를 그대로 보존하고 unmount 시 요청과 이벤트 리스너를 정리한다.

## 완료 상태 판정

`projectViewState.ts`는 서버 의존성이 없는 순수 helper다. 단계 순서는 `ACTIVE_WORKFLOW_STEP_KEYS`, 레거시 표시는 `getWorkflowDisplayStepKey()`를 재사용한다.

- 계약 완료: exact contract ID, `status === "final"`, 그리고 `contract` 완료 step 또는 contract 이후 workflow.
- 콘티 완료: exact conti ID, 그리고 `conti` 완료 step 또는 conti 이후 workflow.
- 병원명이나 최근 문서로 대상을 추론하지 않는다.

## ContractBuilder

Snapshot 조회 키는 modal prop, 저장된 contract의 `workflow_run_id`, source quote의 `workflow_run_id`, page mode의 기존 URL/effective workflow 값 중 실제로 확인된 값으로 유지한다.

최종완료 버튼은 `contractCoreCompleted`를 최종 표시 기준으로 삼는다. 완료 성공 후 timeout으로 idle에 복귀하지 않고 Snapshot을 새로 읽은 뒤 invalidation event를 보낸다. 포털 공개 성공 후에도 같은 방식으로 재조회한다.

Page Context는 `draft`, `final`, `published`를 구분한다. 내부 완료 후에는 `canComplete=false`지만 `canPublish=true`가 될 수 있다. 편집은 내부 완료 또는 공개 후 막는다.

## ContiEditorWorkspace

Hook은 모든 early return보다 앞에서 호출한다. exact canonical conti ID와 workflow ID로 완료 여부를 계산하며 완료 성공 후 상태를 잊지 않는다.

현재 canonical conti를 `setCurrentDocument`와 Page Context에 등록한다. 원시 객체 대신 primitive dependency와 기존 store equality guard를 사용해 React update loop를 만들지 않는다.

`onPublished`의 실제 caller는 `ClientsWorkspace`/`ContiV2App`의 부모 데이터 새로고침 용도다. 공개 전용 side effect가 아니므로 기존 호출은 호환을 위해 유지하되 public API 이름 변경은 하지 않는다.

## Context capability 분리

`canComplete`와 `canPublish`를 Page Context, Store, Snapshot, prompt normalization에 추가한다. `canFinalize`는 기존 화면 호환을 위해 유지한다.

Prompt는 새 필드가 있으면 각각을 우선하고, 없을 때만 `canFinalize`를 fallback으로 사용한다. 내부 최종완료 금지와 포털 공개 금지 지시를 별도 문장으로 생성한다.

## Chat 동기화와 응답

`completeContract`와 `completeConti` 결과에 사후 Snapshot의 `currentStep/currentStepName`을 포함한다. idempotent 성공은 사전 Snapshot의 현재 단계를 반환한다.

도구 응답은 신규 완료일 때만 “이동했어요”라고 말한다. idempotent면 “이미 최종완료”와 현재 단계를 알린다. 브라우저 conversation store는 두 도구의 성공 결과에서 `workflowRunId`를 확인해 invalidation event를 발생시킨다.

## 오류와 안전성

- Snapshot UI는 표시 최적화이며 mutation 안전성은 계속 Core Command가 책임진다.
- 최초 Snapshot 로딩만으로 완료 버튼을 무조건 막지 않는다.
- Snapshot API 오류는 화면 상태 계산에 성공처럼 사용하지 않는다.
- resource ID가 다르면 완료로 표시하지 않는다.
- 포털 공개와 내부 완료는 계속 별개 Command다.

## 검증

- 순수 helper 7개 단계/resource 조합 테스트.
- Context Store의 capability 보존·초기화 테스트.
- Prompt의 분리된 권한 및 legacy fallback 테스트.
- Contract/Conti UI 소스 경로와 Snapshot refresh 테스트.
- 신규 완료/idempotent 채팅 문구 테스트.
- 전체 typecheck, test, production build.
- 안전한 데이터가 있을 때만 브라우저 mutation QA를 수행하며, 미수행 항목은 완료 보고에 명시한다.
