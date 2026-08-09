# 고객관리 화면 2열 단순화 설계

작성일: 2026-08-09

## 1. 배경과 목표

이번 세션에서 고객관리(`/clients`)를 3열(고객 리스트 / 프로젝트 상세 / 공개관리+포털관리) 구조로 개편했다. 기능은 갖췄지만 한 화면에 정보가 너무 많이 노출되어 "CRM 관리툴"처럼 느껴진다는 피드백을 받았다.

이번 개편의 목표는 기능을 줄이는 것이 아니라, **"이 고객에게 지금 무엇을 해야 하는가"를 한눈에 보여주고 나머지는 접어두는 것**이다.

핵심 사용자 흐름: 고객 선택 → 지금 해야 할 일 확인 → 처리 → 공개할 자료 있으면 공개 → 끝.

## 2. 확정된 레이아웃

3열 구조를 폐기하고 2열로 바꾼다.

```
grid-template-columns: minmax(280px, 30%) minmax(0, 70%);
```

- 왼쪽 (~30%): 고객 리스트 — 기존 `ClientListPanel` 재사용, 폭만 조정.
- 오른쪽 (~70%): 선택 고객의 "업무 화면" — 기존 중앙+우측 컬럼을 하나로 합친 새 컬럼.

Olivia 사이드바는 그대로 유지한다. 좌측 목록에서 고객을 선택해도 전체 라우트 리로드는 없다 (기존 `ClientWorkspaceView`의 `loadWorkspace()` 패턴 유지 — 오른쪽만 skeleton).

## 3. 오른쪽 컬럼 정보 우선순위 (고정 순서)

1. 고객 Header (병원명 + 상태 배지, 진료과·프로젝트 수)
2. **다음 할 일 히어로** — 화면에서 가장 크게
3. 진행 상황 (컴팩트, 펼치면 전체 7단계 모달)
4. 고객 공개 대기 (있을 때만)
5. 최근 활동 (최대 4건)
6. 고객 포털 (한 줄)

관리자가 궁금해할 순서가 아니라 "지금 해야 할 일" 순서다.

## 4. 다음 할 일 히어로 — 핵심 설계

### 4.1 공개 대기가 없을 때

`buildWorkflowNextAction()`(`lib/workflowNextAction.ts`)이 계산한 현재 스텝을 기반으로 표시하되, **버튼 동작을 스텝 성격에 따라 분리**한다.

| 스텝 | CTA | 클릭 시 |
|---|---|---|
| 상담·견적(상담) | (변경 없음) | 기존 두 버튼(관련 앱 열기 + 올리비아가 현재 단계 처리하기) 레이아웃 그대로 유지 — 히어로만 새 디자인으로 감싸고 동작은 안 바꾼다 |
| 견적 | **견적서 작성하기 →** | `/quote?clientId=...&workflowRunId=...` — 사람이 직접 견적서 작성 |
| 계약 | **계약서 작성하기 →** | `/contract?...` |
| 촬영 준비(콘티) | **콘티 작성하기 →** | `/conti?...` |
| 촬영 | 기존 `/shooting` 페이지의 "촬영 완료" 그대로 | 기존 방식 유지 |
| 셀렉·보정, 수정·납품, 완료·관리 | 기존 "올리비아가 현재 단계 처리하기" + 업무 프로세스 체크리스트 유지 | 사람이 만드는 새 산출물이 아니라 AI 처리·계산 성격이라 자동화 유지 |

이유: `/quote`, `/contract`, `/conti` 는 이미 완성된 실제 작성 도구이고, 사용자는 "AI가 초안을 만들어주는 것"보다 "직접 작성 화면으로 바로 이동"을 원했다. 반면 상담 요약, PER 계산, 리뷰 콘텐츠 변환 등은 애초에 사람이 "작성"하는 게 아니라 AI가 처리하는 항목이라 기존 자동화 버튼을 유지한다.

### 4.2 새로 추가하는 백엔드 연결 (조사로 확인한 갭)

현재 `/quote`, `/contract`, `/conti` 저장 API(`app/api/quotes/route.ts`, `app/api/contracts/route.ts`, `app/api/conti/saves/route.ts`)는 **워크플로우 진행과 완전히 분리**되어 있다 — 저장해도 `agent_tasks`나 `workflow_runs.current_step_key`가 전혀 바뀌지 않는다. 지금까지는 오직 "올리비아가 현재 단계 처리하기" 버튼만 단계를 넘겼다.

이번 설계에서 다음 할 일이 도구로 직접 연결되므로, **각 저장 API가 성공하면 `maybeAdvanceWorkflow(db, workflowRunId, stepKey)`를 호출하도록 추가한다** (`lib/workflowAutomation.ts`의 기존 함수 재사용, 새 함수 없음). `maybeAdvanceWorkflow`는 해당 스텝에 열린 `agent_tasks`/`agent_approvals`가 없으면 자동으로 다음 단계로 넘긴다 — 버튼을 눌러 초안을 만든 적이 없다면(즉 `agent_tasks`가 아예 생성 안 됐다면) 열린 작업이 0건이라 바로 넘어간다. 이는 기존 원칙("업무 event 발생 → workflow 자동 진행")과 정확히 일치하는 적용이다.

수정 대상:
- `app/api/quotes/route.ts` (POST 성공 후)
- `app/api/contracts/route.ts` (POST 성공 후)
- `app/api/conti/saves/route.ts` (POST/PATCH 성공 후)

### 4.3 공개 대기가 있을 때 — 히어로 완전 교체 (확정)

`pcrm_publications`에 `status`가 발행 전 대기 상태인 항목이 하나라도 있으면, 히어로는 workflow next-action 대신 **"[문서명] 고객 공개"** CTA로 완전히 교체된다. 워크플로우 next-action은 이 순간 히어로에서 숨겨지고, 아래 진행 상황/공개 대기 섹션에서만 확인 가능하다.

```
현재 단계
촬영 준비

다음 할 일
계약서 고객 공개
계약서가 작성되어 공개 대기 중입니다.

[ 미리보기 ]  [ 공개하기 ]
```

여러 건이 동시에 대기 중이면 **가장 먼저 생성된(오래된) 항목**을 히어로에 표시하고, 나머지는 5절의 "고객 공개 대기" 목록에 전부 나열한다.

## 5. 진행 상황 (컴팩트)

기존 7단계(`WORKFLOW_PHASES`, `lib/workflow.ts`)는 유지하되 기본 화면에서는:

```
✓ ───── ● ───── ○ ───── ○ ───── ○ ───── ○ ───── ○
                                              43%
```

정도의 높이가 낮은 바만 표시하고, `[전체 과정 보기]` 클릭 시 모달로 `ProjectWorkflowStepper`의 라벨 붙은 전체 버전을 보여준다. 내부 17단계는 모달에서도 숨긴다.

## 6. 고객 공개 대기

`pcrm_publications`에서 발행 전 대기 상태(`draft`/`internal_review`)인 항목만 표시 — 이미 `published`인 것은 기본 화면에서 완전히 제외한다.

```
고객 공개 대기   2건                [모두 보기]

촬영 콘티          ● 공개 대기      [미리보기] [공개]
셀렉 갤러리        ● 공개 대기      [미리보기] [공개]
```

대기 항목이 없으면 큰 빈 카드 대신 한 줄:
```
고객 공개 대기
✓ 현재 공개 대기 중인 자료가 없습니다.
```

`[공개]` 클릭 시 기존 발행 API(`/api/quotes/[id]/publish`, `/api/contracts/[id]/publish`, `/api/publications/by-type/[relatedType]/[relatedId]/publish`) 그대로 재사용 — 이번 세션 초반에 만든 것 그대로다. 공개되면 그 row는 화면에서 자동으로 사라진다 (상태가 `published`로 바뀌므로 필터에서 빠짐).

`[모두 보기]`는 이미 공개된 것까지 포함한 전체 이력을 모달로 보여주고, 거기서 "공개 중지"도 가능 (기존 `/api/publications/[id]/revoke` 재사용).

## 7. 최근 활동 / 고객 포털 / 메모

- 최근 활동: 기존 `PcrmActivityTimeline` 재사용, `variant="compact"`, 최대 4건만 slice.
- 고객 포털: 기존 `PortalManagementPanel`의 데이터/API 로직(포털 URL, 복사, 새탭, 공유끊기)은 그대로 두되 UI를 한 줄로 압축한다.
  ```
  고객 포털   ● 연결됨
  https://olivia.photoclinic.kr/client-portal/access/...   [복사] [열기] [···]
  ```
  진행률 바는 여기서 제거한다 (3절의 진행 상황과 중복). `[···]` 메뉴 안에 "공유 끊기" 이동.
- 메모: 기본 숨김. 헤더의 `[···]` 또는 작은 `[메모]` 버튼 클릭 시 drawer/모달. 있으면 헤더 근처에 `📌 중요 메모 1건`만 한 줄 표시.

## 8. 프로젝트 selector / 프로젝트 생성 버튼

- 프로젝트가 1개면 selector 자체를 숨긴다 (현재는 `workspace.projects.length > 1`일 때만 노출 — 이미 이 조건으로 구현되어 있어 그대로 유지).
- 메인 화면의 `[프로젝트 생성]` 버튼은 제거한다. 추가 프로젝트가 필요하면 `[···]` 메뉴의 "새 프로젝트 시작"에서만 (기존 `NextActionCard`의 "추가 촬영 시작" 메뉴 항목 재사용).

## 9. 고객 등록 / 견적서 작성 진입점

왼쪽 리스트 상단에 기존 `[+ 고객 등록]` 유지. 페이지 상단에 `[+ 견적서 작성]`을 추가해 시각적 우선순위를 고객 등록과 나란히 둔다. 둘 다 기존 로직 재사용 (`createClientWithWorkflow` — 고객 생성 시 프로젝트+포털 자동 생성 그대로).

## 10. API 변경

`GET /api/clients/[id]/workspace`에 `nextAction` 필드를 **추가**한다 (기존 `workflowSummary` 필드는 그대로 둠 — breaking 없음):

```ts
nextAction: {
  type: "run_current_step" | "advance_step" | "open_app" | "publish_pending" | ...,
  title: string,
  description: string,
  ctaLabel: string,
  ctaHref?: string,       // 도구로 직접 연결하는 스텝일 때
  publicationId?: string, // publish_pending일 때
}
```

계산 로직은 `buildWorkflowNextAction()`을 그대로 호출한 뒤, 4.1의 스텝→CTA 매핑 테이블과 4.3의 공개 대기 우선순위를 적용하는 얇은 래퍼로 구현한다 (새 파일 `lib/clientWorkspace/nextAction.ts`).

## 11. 컴포넌트 변경 계획

- **재사용 그대로**: `ClientListPanel`, `PcrmActivityTimeline`, `ClientFormModal`, 발행/포털 API 전부.
- **로직 재사용 + UI 축소**: `PortalManagementPanel`(한 줄로), `ProjectWorkflowStepper`(컴팩트 바 + 모달로 분리).
- **신규**: `NextActionHero.tsx`, `PendingPublicationsList.tsx`, `PublicationHistoryModal.tsx`, `ProgressDetailModal.tsx`.
- **삭제**: `ProjectSummaryCard.tsx`(히어로에 흡수), 기존 `PublicationManagementPanel.tsx`의 7종 전체 나열 UI(대기 목록으로 대체 — 발행 API 호출 로직은 `PendingPublicationsList`로 이관).
- `app/(client-hub)/clients/page.tsx`의 `ClientWorkspaceView` 그리드를 3열→2열로 수정하고 오른쪽 컬럼 렌더를 9절 순서대로 재구성한다.

`DetailView`(구 8탭 상세, `?id=` 경로)는 이번에도 건드리지 않는다.

## 12. 유지해야 할 것 (깨뜨리면 안 됨)

`clients`, `workflow_runs`, 17단계 workflow, 7단계 summary mapping, 견적/계약/publication/셀렉 갤러리/RAW/보정본/최종사진/portal/고객 포털/`revokePortalAccess`/activity logs/기존 발급된 포털 URL 전부 그대로.

## 13. 완료 기준

1. 고객관리 메인 화면이 2열(30%/70%)이다.
2. 고객 클릭 시 전체 reload 없이 오른쪽만 갱신된다.
3. 다음 할 일이 화면에서 가장 크게 보인다.
4. 견적/계약/콘티 단계에서는 CTA가 해당 도구로 직접 연결되고, 그 도구에서 저장하면 워크플로우가 자동으로 다음 단계로 넘어간다.
5. 공개 대기 자료가 있으면 히어로가 공개 CTA로 교체된다.
6. 7단계 진행 상황은 컴팩트하게, 전체 보기는 모달로.
7. 공개 대기 목록엔 대기 중인 것만, 공개된 건 기본 숨김(이력 모달에서 확인).
8. 포털은 한 줄 요약 + `[···]`로 공유 끊기.
9. 최근 활동은 4건 이하.
10. 메모는 기본 숨김.
11. 프로젝트 1개면 selector 숨김, 2개 이상이면 표시.
12. 기존 고객 포털/공개 이력/워크플로우 자동화 전부 그대로 동작.
