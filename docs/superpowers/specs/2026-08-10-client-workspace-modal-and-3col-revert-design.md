# 고객관리 3열 복귀 + 업무 Workspace Modal 설계

작성일: 2026-08-10

## 1. 배경과 목표

전날 세션에서 고객관리를 3열→2열(다음 할 일 히어로 중심)로 단순화했는데, 사용자가 이미지 2장을 참고로 **레이아웃은 3열로 시각적 복귀**를 요청했다 — 왼쪽 고객 리스트, 중앙 프로젝트 화면, 오른쪽 공개관리(상단)+포털관리(하단) 상시 노출. 2열 작업에서 만든 백엔드 로직(`nextAction` 계산, 견적/계약/콘티 저장 시 자동진행 `maybeAdvanceWorkflow`, 발행 API)은 전부 유지하고 재사용한다 — 바뀌는 건 화면 배치와, "다음 할 일"/"공개" 버튼을 눌렀을 때 **페이지 이동 대신 대형 모달이 뜨는 것**뿐이다.

두 번째 목표: 견적서 작성을 별도 페이지 이동 없이 고객관리 화면 위에 뜨는 대형 Workspace Modal에서 처리한다. 계약서/콘티/갤러리 등은 이번 1차 범위에서 제외(설계 문서 12절), 견적서만 먼저 검증한다.

## 2. 레이아웃: 3열 복귀

```
grid-template-columns: minmax(300px, 30%) minmax(420px, 45%) minmax(320px, 25%);
```

- **왼쪽(30%)**: `ClientListPanel` — 무수정, 그대로 재사용.
- **중앙(45%)**: 헤더(병원명/상태뱃지/메모 아이콘) → **프로젝트 화면 카드**(현재 프로젝트/현재 상태/다음 할 일/촬영 예정일/담당자/최근 활동 — 이미지 2 그대로) → **진행 단계**(`ProjectWorkflowStepper`, `compact` prop 없이 기본값=라벨 있는 전체 버전) → **메모**(상시 노출, 모달 아님).
- **오른쪽(25%)**: **공개 관리**(7개 타입 전부 항상 노출, `pending_publish`만 필터링하지 않음 — 상태 배지 + 액션 버튼) → **포털 관리**(URL + 진행 현황 바 + 공개 항목 배지 — 2열에서 압축했던 것 복원).

### 다음 할 일의 위치와 동작

이미지 2에서 "다음 할 일"은 프로젝트 화면 카드 안의 한 row다(2열의 큰 히어로가 아님). 값은 그대로 `workspace.nextAction`(2열 작업에서 만든 `computeClientWorkspaceNextAction()`)을 사용하되, 클릭 동작만 바뀐다:

- `nextAction.kind === "tool_link"` (quote/contract/conti 단계) 중 **quote만 이번 범위**: 클릭 시 `openWorkspaceModal({type:"quote", clientId, workflowRunId})` 실행 — 페이지 이동 없음. contract/conti는 아직 모달이 없으므로 **당분간 기존처럼 `/contract`, `/conti` 페이지로 이동**(2열 때 만든 `ctaHref` 그대로 사용 — 다음 차수에서 모달로 교체).
- `nextAction.kind === "publish_pending"`: row가 "[문서명] 고객 공개"로 표시(2열과 동일 문구). quote 타입이면 클릭 시 견적 모달을 **발행 검토 모드**로 오픈(섹션 19 요구사항 — 미리보기 확인 후 공개). 그 외 타입은 기존처럼 즉시 발행 API 호출(모달 없음, 2열 때 만든 `publishActions.ts` 그대로).
- `nextAction.kind === "legacy_card"`: 기존 `NextActionCard` 그대로(무수정, 페이지 이동 없이 이미 동작 중).

### 공개 관리 패널 (부활)

2열에서 만든 `PendingPublicationsList`(대기 중만 표시)는 오른쪽 패널에서 빼고, 7개 타입 전부 상시 노출하는 패널을 새로 만든다(과거 `PublicationManagementPanel`과 유사하지만 quote 타입의 "공개" 버튼만 모달을 연다):

- quote 타입 행의 "공개" 버튼: `openWorkspaceModal({type:"quote", ..., reviewMode:true})`.
- 나머지 6개 타입: 기존 `publishActions.ts`의 `publishPublicationType()` 직접 호출(모달 없음 — 콘티/갤러리 등 모달이 없는 동안은 이 방식 유지).
- "전체 공개 이력" 버튼은 2열에서 만든 `PublicationHistoryModal` 그대로 재사용.

### 포털 관리 패널 (풀버전 복원)

2열에서 `compact` 압축한 `PortalManagementPanel`에 `compact?: boolean`(기본 `false`) prop을 추가한다 — 새 파일을 만들지 않고 기존 압축 UI를 `compact=true` 분기로 옮기고, 기본(3열용)은 원래 있었던 URL+복사+열기+공유끊기 / 진행 현황 바 / 공개 항목 배지 전체 UI로 되돌린다.

## 3. Workspace Modal 공통 컴포넌트

`components/client-workspace/WorkspaceModal.tsx` (신규):

- `width: min(94vw, 1800px)`, `height: 92vh`, 흰 배경, `border-radius: 18px`, backdrop `rgba(0,0,0,.35)`.
- **ESC로 안 닫힘, backdrop 클릭으로도 안 닫힘** — 오직 헤더의 `[X]` 버튼, 또는 내부 "닫기" 액션으로만 닫힌다(문서 작업 도중 실수 방지, 설계 문서 16절 요구사항).
- Props: `{ open, onClose, title, subtitle, children, footer? }` — 헤더(제목/부제 + X버튼)와 children(기능별 실제 화면)만 표준화하고, 하단 액션 바(임시저장/미리보기/공개)는 각 Builder가 `footer` slot으로 채운다(기능마다 버튼 구성이 다르므로).
- `createPortal` + 새 CSS 클래스(`workspace-modal-backdrop`, `workspace-modal`) — 기존 `pcrm-dialog-backdrop`(폼 크기 다이얼로그용)와는 별도, 대형 전용.
- 배경 dim만 처리, blur 없음(설계 문서 31절).

## 4. QuoteBuilder를 page/modal 겸용으로

`app/photoclinic/page.tsx`의 컴포넌트는 이미 이름이 `QuoteBuilder`이고 default export 하나뿐이며 자체적으로 완결된 컴포넌트다(발행 로직까지 포함, 외부 워크스페이스 의존 없음) — 확인 결과 **파일을 쪼개지 않고 같은 파일 안에서 props를 받도록 확장**하는 것이 가장 안전하다(2375줄 컴포넌트를 여러 파일로 물리적으로 재배치하면 회귀 위험이 크다 — 39절 원칙과 충돌하지 않음: "동일 컴포넌트 재사용"이지 "여러 파일로 쪼개기"가 목적이 아니다).

```ts
export default function QuoteBuilder({
  mode = "page",
  clientId,
  projectId,
  resourceId,       // 특정 견적서를 열 때(발행 검토 모드 등)
  onClose,
  onPublished,
}: {
  mode?: "page" | "modal";
  clientId?: string;
  projectId?: string;
  resourceId?: string;
  onClose?: () => void;
  onPublished?: () => void;
} = {}) { ... }
```

`app/quote/page.tsx`, `app/photoclinic/page.tsx`를 직접 여는 라우트는 그대로 `<QuoteBuilder mode="page" />`(props 없음 = 기존 동작 100% 그대로).

### 4.1 신규 기능 (현재 페이지에 없던 것 — 이번에 추가)

1. **clientId 프리필**: `mode==="modal"`이고 `clientId`가 있으면 마운트 시 `/api/clients/[id]/workspace`를 호출해 병원명/담당자/연락처/이메일/촬영일을 고객 정보 입력 필드에 채운다(사용자가 다시 입력 안 하도록, 설계 문서 8절). `resourceId`가 있으면 해당 견적서를 불러와 편집 모드로 연다.
2. **dirty 추적**: 입력 필드가 마지막 저장 스냅샷과 달라지면 `dirty=true`. 기존 저장 함수(`saveRecentQuote`)가 성공하면 스냅샷을 갱신하고 `dirty=false`.
3. **자동 저장**: dirty 상태가 1000ms 동안 안 바뀌면(debounce) 기존 `saveRecentQuote()`를 자동 호출 — 새 저장 로직을 만들지 않고 기존 수동저장 함수를 재사용한다. 헤더에 "저장 중.../저장됨/저장 실패" 상태 표시.
4. **닫기 정책**: `mode==="modal"`일 때 `[X]`는 `dirty`면 확인 다이얼로그(계속 작성/임시 저장 후 닫기/저장 안 하고 닫기), 아니면 즉시 `onClose()`.
5. **발행 후 콜백**: 기존 `publishQuoteToPortal()` 성공 시 `mode==="modal"`이면 0.7초 성공 표시 후 `onPublished?.()` → `onClose?.()` 호출(설계 문서 14절).

### 4.2 그대로 두는 것

- 견적 입력/패키지 선택/실시간 미리보기/PDF 다운로드/포털 발행 로직 — 전부 무수정.
- `mode==="page"`일 때는 위 5개 신규 기능이 전혀 개입하지 않는다(props가 없으면 `clientId=undefined`이므로 프리필 useEffect가 실행 안 됨, dirty/autosave는 내부 상태로만 존재하고 UI에 아무 영향 없음 — 기존 페이지 동작 100% 보존).
- `mode==="page"`일 때만 `<PageHeader>` 렌더, `mode==="modal"`이면 스킵(모달 자체 헤더가 이미 있으므로 이중 헤더 방지).

## 5. 고객관리 페이지 연결

`app/(client-hub)/clients/page.tsx`의 `ClientWorkspaceView`:

- 그리드 3열로 복귀(2절).
- `workspaceModalState: { type: "quote"; clientId; workflowRunId; resourceId?; reviewMode?: boolean } | null` 로컬 state 추가.
- `<WorkspaceModal open={...} onClose={...} title="{병원명} · 견적서 작성">` 안에 `<QuoteBuilder mode="modal" clientId=... resourceId=... onClose=... onPublished={refreshWorkspace}>` 렌더.
- "다음 할 일"/공개관리의 quote 행 클릭 → `setWorkspaceModalState({type:"quote", ...})`.

## 6. 유지해야 할 것

2열 작업에서 만든 것 중 계속 쓰는 것: `computeClientWorkspaceNextAction`, `maybeAdvanceWorkflow`/`completeOpenStepTasksForManualSave` 자동진행 로직, `publishActions.ts`, `PublicationHistoryModal`, `ProgressDetailModal`(전체 과정 보기용으로 유지), `ProjectWorkflowStepper`의 `compact` prop(오른쪽 패널에선 안 쓰지만 모달 안 "전체 과정 보기"에서 여전히 필요). `NextActionCard.tsx`는 여전히 무수정.

## 7. 이번 1차 범위 (완료 기준은 사용자 스펙 46절과 동일)

1. `WorkspaceModal` 공통 컴포넌트
2. `QuoteBuilder`에 mode prop 추가(프리필/dirty/자동저장/닫기정책/발행콜백)
3. 고객관리 3열 복귀(프로젝트 화면 카드, 공개관리 전체노출, 포털관리 풀버전)
4. "다음 할 일" quote 클릭 → 모달
5. 공개관리 quote 행 "공개" 클릭 → 모달(발행 검토 모드)
6. 저장/발행 후 고객 workspace 자동 refresh
7. unsaved changes 확인 다이얼로그

계약서/콘티/갤러리 모달화, 모바일 대응, 브라우저 back/forward로 모달 복구는 다음 차수로 미룬다(사용자 스펙 27~28, 42~43절).

## 8. 검증 계획

로컬: tsc/vitest/build + Playwright(그리드 3열 확인, 모달 열기/닫기, dirty 확인창, 자동저장 상태 표시). `mode="page"` 회귀 확인 필수 — 기존 `/quote` 페이지가 predicated 그대로 동작하는지 스크린샷으로 대조.

프로덕션: `[테스트]` 고객으로 재현 — 고객관리에서 다음 할 일(견적서 작성) 클릭 → 모달 오픈 확인 → 견적 입력 → 자동저장 확인 → 공개 → 모달 닫힘 → 공개관리에 "공개됨" 반영 + 최근 활동 갱신 + 다음 할 일이 계약서로 바뀌는지 확인. 완료 후 테스트 고객 소프트 삭제.
