# Olivia 2.0 Phase 1: Persistent Workspace 설계

작성일: 2026-09-01
범위: Persistent Workspace + Smooth Transition

## 1. 목표

Olivia와 대화하다가 기능을 실행해도 별도 페이지로 이동한 느낌이 들지 않도록 한다. Chat은 앱의 단일 persistent 인스턴스로 유지하고 Workspace 내용만 교체한다.

Phase 1의 완료 조건은 다음과 같다.

- Sidebar와 Header가 기능 전환 중 유지된다.
- Olivia Chat 컴포넌트가 Workspace 전환으로 재마운트되지 않는다.
- 메시지, 스크롤 위치, 입력 draft, streaming 상태가 유지된다.
- Workspace 상태에서 Desktop 비율은 Workspace 70%, Chat 30%로 고정된다.
- 견적, 계약, 콘티, 사진 분류 Workspace를 같은 API로 열고 교체한다.
- 기존 직접 URL로 진입해도 동일한 Workspace Shell을 사용한다.
- 기존 route와 기존 business component를 삭제하거나 복제하지 않는다.

## 2. 현재 구조와 문제

현재 저장소에는 Phase 1 기반이 이미 존재한다.

- `useOliviaLayoutStore`: `idle`, `conversation`, `workspace`, `workspace-chat-expanded`, `fullscreen` 상태 및 70/30 정책
- `workspaceStore`: Workspace type, resource context, open/switch/close/fullscreen action
- `OliviaAdaptiveStage`: 홈 전용 Chat/Workspace split
- `OliviaPersistentChat`: 홈 밖에서 유지되는 전역 Chat 진입점
- `DynamicWorkspace`: Registry로 선택한 기존 Builder 렌더링
- `WorkspaceRegistry`: quote, contract, conti, photo-sort 등록
- `WorkspaceMorphTransition`: Workspace 등장 애니메이션
- `actionRouter`: Agent UI Action을 기존 Store action으로 연결

핵심 문제는 Chat surface가 두 개라는 점이다. 홈은 `OliviaAdaptiveStage` 내부의 `OliviaConversation`을 사용하고, 다른 페이지는 루트의 `OliviaPersistentChat`을 사용한다. Store 데이터는 유지되지만 Chat 컴포넌트 자체가 route 경계에서 교체되므로 draft, scroll, transient DOM state를 완전히 보존할 수 없다.

또한 직접 route 진입과 Agent Workspace open이 서로 다른 렌더 경로를 사용한다. Workspace 전환 애니메이션 key도 Workspace identity가 아니라 고정값이어서, 빠르게 다른 기능으로 전환할 때 명확한 exit/enter 경계가 없다.

## 3. 선택한 접근

루트에 이미 유지되는 `OliviaPersistentChat`을 단일 Chat 인스턴스로 승격한다. 새로운 Chat Store나 Workspace Store는 만들지 않는다.

새 `OliviaWorkspaceShell`은 다음을 조합한다.

```text
OliviaWorkspaceShell
├── Existing Sidebar/Header/Page chrome
├── WorkspaceViewport
│   └── DynamicWorkspace
└── PersistentChatViewport
    └── OliviaConversation (single instance)
```

홈의 greeting, quick prompt, context drawer는 유지하되 Chat 자체는 Shell이 소유한다. 홈 전용 화면에서 중복 `OliviaConversation`을 제거한다.

지원하지 않는 기존 페이지는 기존 route content를 그대로 보여주고 persistent Chat을 함께 유지한다. Phase 1에서 모든 페이지를 Workspace Registry에 강제로 등록하지 않는다.

## 4. 상태 소유권

### 4.1 Layout

`useOliviaLayoutStore`가 계속 다음 상태의 단일 진실 공급원이다.

- `idle`
- `conversation`
- `workspace`
- `workspace-chat-expanded`
- `fullscreen`

streaming, focus, hover는 폭을 변경하지 않는다. 사용자가 명시적으로 대화를 확장했을 때만 `workspace-chat-expanded`를 사용한다.

### 4.2 Workspace

기존 `workspaceStore`가 Workspace identity와 표시 mode를 소유한다.

- `openWorkspace(type, context)`
- `switchWorkspace(type, context)`
- `closeWorkspace()`
- `enterFullscreen()`
- `exitFullscreen()`

외부 소비자가 `router.push`와 Store 변경을 각각 구현하지 않도록 공통 navigation adapter를 둔다. Agent action과 UI card는 이 adapter를 통해 같은 Store action을 호출한다.

### 4.3 Conversation

기존 `useOliviaConversationStore`를 유지한다. 메시지, streaming, 전송 상태는 Store가 소유하고, draft 및 scroll 위치는 재마운트되지 않는 단일 `OliviaConversation` 인스턴스가 소유한다.

### 4.4 Context

기존 `oliviaContextStore`가 customer, project, workspace, resource, selection을 계속 소유한다. Workspace navigation adapter는 Workspace 변경과 Context 변경을 원자적인 한 흐름으로 호출한다. 별도 Runtime Context Store는 Phase 1에서 만들지 않는다.

## 5. Workspace Registry와 Direct Route

Registry entry를 다음 역할까지 확장한다.

- Workspace type과 label/icon/component 연결
- 관련 direct route 목록
- URL에서 `resourceId`, `clientId`, `workflowRunId`를 읽는 adapter
- 필요 시 component chunk preload 함수

Phase 1 대상은 다음과 같다.

| Workspace | 기존 component | direct route |
| --- | --- | --- |
| quote | `QuoteBuilder` | `/quote`, 기존 admin tool alias |
| contract | `ContractBuilder` | `/contract`, 기존 admin tool alias |
| conti | `ContiBuilder` | 기존 콘티 작성 route와 admin tool alias |
| photo-sort | `PhotoWorkspace` 통합 화면 | `/photo-sorting`, 기존 admin tool alias |

직접 URL 진입 시 route bridge가 URL을 Store에 동기화하고 같은 Shell에서 Registry component를 연다. URL 파일은 유지한다. 브라우저 새로고침과 back/forward에서 URL이 Workspace 상태를 다시 구성할 수 있어야 한다.

Workspace API로 연 경우 canonical URL은 등록된 Next Router를 통해 동기화한다. 같은 Workspace의 query만 바뀌는 경우에는 Shell이나 Chat identity를 변경하지 않는다.

## 6. Rendering 구조

Shell은 Chat DOM node를 항상 같은 위치와 identity로 유지한다. CSS grid 또는 flex 영역 비율만 mode에 따라 바꾼다.

- conversation: Workspace viewport를 닫고 Chat을 중심/넓은 영역에 표시
- workspace: Workspace 70%, Chat 30%
- workspace-chat-expanded: Workspace 38%, Chat 62%
- fullscreen: Workspace를 최대화하되 같은 Chat node를 숨겨 보존하고 명시적인 drawer control로 노출

Workspace component는 Workspace identity가 바뀌면 교체된다. Chat은 Workspace identity key 아래에 두지 않는다.

지원하지 않는 route의 page content는 기존대로 렌더링한다. 이 경우 persistent Chat은 기존 인페이지 side panel 정책을 유지한다.

## 7. Transition

Framer Motion 외의 dependency를 추가하지 않는다.

### 7.1 Chat transition

- conversation → workspace: 넓은 Chat 영역이 오른쪽 30%로 축소
- duration: 320ms
- easing: ease-out 계열 `[0.32, 0.72, 0, 1]`
- scale 사용 금지
- layout width 변경은 명시적 layout mode 변경에만 반응

### 7.2 Workspace transition

- enter: `opacity 0 → 1`, `translateY 6px → 0`, 220ms
- exit: `opacity 1 → 0`, `translateY 0 → 4px`, 180ms
- key: `${workspaceType}:${resourceId ?? "new"}`
- 전환 중 최신 Workspace identity만 최종 화면으로 남긴다.

### 7.3 Reduced motion

`prefers-reduced-motion`에서는 transform을 제거한다. opacity duration은 매우 짧게 하거나 즉시 전환한다. Sidebar와 Header에는 transition을 적용하지 않는다.

## 8. Performance

- Builder는 `next/dynamic` 또는 동등한 lazy import로 Workspace가 열릴 때만 로드한다.
- hover/focus 시 Registry preload 함수를 호출할 수 있도록 공통 hook을 제공한다.
- Chat은 Workspace Store 전체가 아니라 필요한 layout selector만 구독한다.
- Workspace 교체 상태를 Chat component props로 전달하지 않아 메시지 목록의 불필요한 재렌더를 줄인다.
- 애니메이션 frame 안에서 데이터 fetching, 이미지 decode, 대규모 계산을 수행하지 않는다.
- 컴포넌트 memoization은 실제로 큰 하위 트리나 안정적인 props 경계에만 적용한다.

## 9. 오류와 경합 처리

- Registry에 없는 Workspace 요청은 현재 페이지를 유지하고 사용자에게 실행 불가 상태를 반환한다.
- Direct route parsing에 실패하면 기존 route component로 안전하게 fallback한다.
- 빠른 A → B → C 전환에서는 Store의 최신 identity가 최종 source of truth이며, animation completion callback이 이전 identity를 복원하지 않는다.
- Builder load 실패 시 Chat과 Shell은 유지하고 Workspace viewport에 재시도 가능한 오류 상태를 표시한다.
- fullscreen 상태에서 Workspace가 닫히면 layout을 conversation으로 정상화한다.

## 10. 기존 코드 유지 범위

다음은 삭제하거나 일괄 재작성하지 않는다.

- `legacyOliviaCore`
- 기존 v2 tool selection/executor 및 verification
- quote/contract/conti/photo business component
- 기능별 session store
- 기존 route 파일과 deep link
- existing action confirmation/audit/inline task
- 기존 `oliviaContextStore`, `useOliviaConversationStore`, `useOliviaLayoutStore`, `workspaceStore`

Phase 1은 layout/navigation/rendering 경계만 정리한다. Smart Intent, multi-step Plan, Action Runtime, Unified Runtime Context, Feature Engine 분리는 후속 Phase에서 진행한다.

## 11. 테스트 계획

### 11.1 Store와 navigation

- conversation → workspace
- workspace → 다른 workspace
- workspace → conversation
- workspace → fullscreen
- fullscreen → workspace
- card action과 Agent action이 같은 navigation adapter 사용
- direct URL → Workspace Store 복원
- back/forward → Workspace identity 복원

### 11.2 Persistence

- Workspace open/switch/close 동안 Chat mount identity 유지
- input draft 유지
- message scroll position 유지
- streaming 중 Workspace 전환 후 streaming 완료
- customer/project Context 유지

### 11.3 Transition

- Workspace key가 type/resource 변경을 반영
- 빠른 다중 전환 후 마지막 Workspace만 표시
- reduced-motion에서 transform 비활성화
- Sidebar/Header에 animation class가 적용되지 않음

### 11.4 Regression

- quote
- contract
- conti
- photo sorting
- 기존 Olivia Chat
- 기존 route 직접 접근
- 지원하지 않는 일반 페이지와 global Chat

## 12. 검증

Phase 1 구현 후 다음을 실행한다.

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

기존 실패가 있다면 구현 전 baseline과 비교하여 구분한다. 실제 브라우저에서 Desktop과 reduced-motion 조건으로 홈 → 견적 → 콘티 → 홈, 직접 route 진입, back/forward, 빠른 Workspace 전환을 확인한다.

## 13. Phase 1 비범위

- 새로운 intent resolver 구현
- multi-step action planner 구현
- 공통 action state machine 구현
- 모든 tool의 DB verification migration
- 새로운 Runtime Context Store
- 모든 giant component의 engine/service 분리
- Semantic Photo Select 구현

이 항목들은 Phase 1의 persistent UI foundation이 검증된 뒤 Phase 2~4에서 기존 구조를 점진적으로 확장한다.
