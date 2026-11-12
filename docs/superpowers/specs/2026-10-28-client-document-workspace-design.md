# 고객 문서 작업공간 설계

## 목표

고객관리는 진행 단계를 조작하는 화면이 아니라 병원별 문서를 찾고 수정하는 단일 작업공간으로 만든다. 첫 화면은 승인 대기 견적과 등록 고객을 분리하고, 고객을 열면 문서·최근 기록·고객 전용 채팅을 보여준다. 문서를 열면 같은 화면 안에서 기존 편집기를 그대로 렌더한다.

## 화면 상태

- `list`: 병원 검색, 승인 대기 견적, 등록 고객 목록
- `case`: 선택 고객의 기본 정보, 읽기 전용 진행 게이지, 문서 5개, 최근 기록, 고객 전용 채팅
- `work`: 고객 머리를 한 줄로 접고 견적서·계약서·콘티 탭과 고객 전용 채팅을 유지

문서 상태는 React 메모리에만 둔다. URL과 Olivia OS 영속 상태에는 문서 id를 남기지 않아 새로고침이나 창 복원 시 고객 화면 또는 생성 화면으로 돌아온다.

## 데이터

- 첫 화면용 서버 API가 승인 대기 견적과 고객별 최신 워크플로우를 함께 반환한다.
- 진행률은 `ACTIVE_WORKFLOW_STEPS`만 읽어 계산한다. `WORKFLOW_STEPS` 전체 카탈로그와 기존 문자열 키는 보존한다.
- 고객 상세는 기존 `/api/clients/[id]` 응답과 `PcrmActivityTimeline`을 재사용한다.
- 견적 승인 API는 견적 상태를 승인으로 바꾸고 `resolveQuoteClient`/`linkNewClientToQuote`를 사용해 기존 고객 연결 또는 신규 고객 생성을 수행한다. 후보가 여러 명이면 후보 선택 응답을 반환한다.

## 문서 편집

- 견적: `QuoteBuilder`
- 계약: `ContractBuilder`
- 콘티: `ContiV2App`을 감싼 `ContiWorkspaceAdapter`

새 편집 UI나 별도 저장소를 만들지 않는다. 고객 id, workflow run id, 기존 resource id만 기존 컴포넌트에 넘긴다.

## 고객 전용 채팅

`/api/olivia/client-chat`가 고객별 대화 행과 메시지를 별도로 관리한다. 통합 채팅의 분류·도구 추리기·엔진 분기는 사용하지 않는다. 고정된 도구 목록을 모델에 전부 제공하고, 서버가 모든 호출의 `clientId`, 활성 workflow/resource context를 화면 값으로 덮어쓴다. 다른 병원 요청은 실행 전에 거절한다.

통합 대화용 `assistant_conversations_owner_active_unique`는 `client_id is null`인 대화에만 적용하고, 고객 대화는 `(owner_id, client_id)`별 active 한 건을 허용한다.

## 안전과 호환

- Desktop 영속 context에서 `resourceId`와 `documentId`를 저장하지 않고, 복원 시 과거 값도 제거한다.
- 대상 없는 콘티 생성 키는 모듈 메모리에 저장하지 않는다.
- 일정 저장 검증은 빈 문자열과 null을 같은 값으로 본다.
- 통합 채팅의 일정 강제 도구 판단은 현재 메시지만 본다.
- `/clients?id=...`와 `/clients?clientId=...`는 모두 같은 고객을 연다.
- 옛 하위 페이지는 삭제하지 않고, 이번 요청에 지정된 진입 링크만 제거한다.

