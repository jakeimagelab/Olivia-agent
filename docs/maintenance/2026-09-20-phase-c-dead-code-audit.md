# PHASE C — 죽은 코드 정적 분석

- 기준 커밋: `9bc41de1`
- 분석일: 2026-09-20
- 최초 분석 범위: 추적 중인 TypeScript/JavaScript 소스 1,600개, App Router 페이지 139개
- 최종 분석 범위: 추적 중인 TypeScript/JavaScript 소스 1,560개, App Router 페이지 138개
- 상태: **승인된 삭제 및 검증 완료**

## 분석 방법

1. `git ls-files`에 포함된 `app`, `components`, `lib`, `scripts`, `tests`의 TS/TSX/JS/JSX만 대상으로 삼았다.
2. TypeScript preprocessor와 정적·동적 import 문자열을 이용해 파일 의존 그래프를 만들었다.
3. Next.js의 `page`, `layout`, `route`, `error`, `global-error` 등과 scripts/tests를 엔트리포인트로 보고 도달성을 계산했다.
4. 페이지 경로는 Desktop registry, Dock, `ALL_TOOLS` 앱 그리드, Tablet 앱 목록, Mobile navigation 및 일반 링크 문자열을 교차 확인했다.
5. Worker의 `new URL(..., import.meta.url)`, 외부 webhook/API 호출, 레거시 호환 경로는 정적 import가 없어도 삭제 후보에서 제외했다.

결과:

- 직접 import 0개인 내부 파일: 50개
- 엔트리포인트에서 도달 불가한 내부 파일과 그 전용 의존성: 92개
- Registry/Dock/App Grid에서 도달 불가한 페이지: 7개

정적 분석은 삭제의 충분조건이 아니다. 아래의 **승인된 삭제 목록**만 높은 확신으로 분리해 삭제했고, 나머지는 보류했다.

## 승인 후 삭제 완료

사용자 승인 후 총 40개 파일, 1,825줄을 삭제했다. 삭제 후 의존 그래프를 다시 계산한 결과 직접 import 0개인 내부 파일은 27개, 엔트리포인트에서 도달 불가한 내부 파일과 전용 의존성은 56개로 줄었다. 새로 확인된 항목은 모두 아래 보류 범주 또는 런타임 특수 로딩에 해당해 추가 삭제하지 않았다.

### 1. 명시적으로 대체되었거나 완전히 고립된 파일

- `lib/replicate.ts` — import 0개. `lib/fal.ts`가 Replicate 경로를 대체하며 실제 `/api/variation`도 `lib/fal.ts`를 사용한다.
- `components/olivia-os/adapters/ComingSoonPlaceholder.tsx` — import 0개. Registry 주석 외에는 사용되지 않고 실제 어댑터가 모두 연결되어 있다.
- `components/SessionProviderWrapper.tsx`
- `components/AdminPageShell.tsx`
- `components/EmbedPage.tsx`
- `components/PageHeader.tsx`
- `components/PageHeading.tsx`
- `components/olivia-os/DesktopShortcut.tsx`
- `lib/diagnosis/utils.ts`
- `lib/styles.ts`

### 2. 참조 없는 공통/Admin UI

- `components/admin/ActionCard.tsx`
- `components/admin/OliviaRecommendationPanel.tsx`
- `components/admin/RecentActivityWidget.tsx`
- `components/admin/StatusBadge.tsx`
- `components/admin/SummaryCard.tsx`
- `components/ui/Card.tsx`
- `components/ui/EmptyState.tsx`
- `components/ui/Field.tsx`
- `components/ui/ScoreCard.tsx`

각 파일과 export 이름을 전체 추적 소스에서 확인했으며, 자신의 선언 외 import/사용이 없다.

### 3. `/team` 통합 후 남은 구형 클라이언트 트리

`/team/goals`, `/team/reports`, `/team/projects`, `/team/today`는 현재 모두 `/team`으로 redirect한다. 아래 클라이언트 컴포넌트는 redirect 페이지나 현재 `WorkspacePage` 어느 쪽에서도 import되지 않는다.

- `app/team/goals/TeamGoalsClient.tsx`
- `app/team/reports/TeamReportsClient.tsx`
- `components/team-workspace/goals/DailyGoalEditor.tsx`
- `components/team-workspace/goals/DailyGoalResult.tsx`
- `components/team-workspace/goals/TeamGoalOverview.tsx`
- `components/team-workspace/projects/NewProjectDialog.tsx`
- `components/team-workspace/projects/ProjectCard.tsx`
- `components/team-workspace/projects/ProjectList.tsx`
- `components/team-workspace/projects/ProjectMembers.tsx`
- `components/team-workspace/projects/ProjectOverview.tsx`
- `components/team-workspace/projects/ProjectTaskList.tsx`
- `components/team-workspace/tasks/TaskCard.tsx`
- `components/team-workspace/today/MyTaskList.tsx`
- `components/team-workspace/today/ReviewRequestPanel.tsx`
- `components/team-workspace/today/TeamStatusPanel.tsx`
- `components/team-workspace/today/TodayDashboard.tsx`
- `components/team-workspace/today/TodayGoalCard.tsx`

### 4. 참조 없는 구형 publication UI

- `components/client-workspace/PendingPublicationsList.tsx`
- `components/client-workspace/PublicationRow.tsx`
- `lib/clientWorkspace/publishActions.ts`

세 파일은 서로만 연결된 고립된 하위 그래프이며 현재 페이지·API·테스트에서 진입점이 없다.

### 5. 독립 데모 라우트

- `app/select/demo/page.tsx` — mock 데이터와 `picsum.photos`만 사용하는 데모다. Registry, Dock, 앱 그리드, 링크, 테스트에서 참조되지 않는다.

## 삭제 보류 목록

아래는 도달 불가 분석에 잡혔지만 중복 구현 조사 또는 런타임 특성 때문에 삭제하지 않는다.

### 구형 고객관리 구현

- `app/(client-hub)/clients/_components/PcrmDashboard.tsx`
- `app/(client-hub)/clients/_components/WorkflowBar.tsx`

현재 `/clients`는 `ClientsWorkspace`를 사용한다. 두 파일은 구형 구현으로 보이지만 기능 비교 없이 삭제하지 않는다.

### 구형 콘티 구현 전체

- `components/conti/ContiBuilder.tsx`
- `components/conti/ContiChecklist.tsx`
- `components/conti/ContiExportActions.tsx`
- `components/conti/ContiLensSelect.tsx`
- `components/conti/ContiSceneRow.tsx`
- `components/conti/ContiSceneTable.tsx`
- `components/conti/ContiSchedule.tsx`
- `components/conti/ContiSetupForm.tsx`
- `components/conti/ContiSummaryBar.tsx`
- `components/conti/types.ts`

현재 Conti V2와 중복되는 큰 구현이므로 요청서 원칙대로 목록만 남긴다.

### 구형 Dashboard/Home 구현

- `components/dashboard/DailyQuoteWidget.tsx`
- `components/dashboard/EmptyBriefingState.tsx`
- `components/dashboard/IntegratedCalendar.tsx`
- `components/dashboard/MarketingBriefing.tsx`
- `components/dashboard/MarketingBriefingItem.tsx`
- `components/dashboard/RecentProjects.tsx`
- `components/dashboard/RecentWork.tsx`
- `components/dashboard/SmartSuggestions.tsx`
- `components/dashboard/TodayAlertBanner.tsx`
- `components/dashboard/WorkBriefing.tsx`
- `components/dashboard/WorkBriefingItem.tsx`
- `components/dashboard/WorkflowConsistencyWidget.tsx`
- `components/dashboard/WorkspaceTodoCard.tsx`
- `lib/dashboardBriefing.ts`
- `lib/mockMarketingBriefing.ts`
- `components/home/OliviaAdaptiveStage.tsx`
- `components/home/OliviaHeroChat.tsx`
- `components/home/OliviaHomeContextDrawer.tsx`

최근 홈 개편 전 구현으로 보이지만 복구·직접 경로 가능성을 확인하기 전에는 지우지 않는다.

### Olivia 중복/레거시 구현

- `components/olivia/OliviaActionCard.tsx`
- `components/olivia/OliviaApprovalSummary.tsx`
- `components/olivia/OliviaAssistantWorkspace.tsx`
- `components/olivia/OliviaBriefingPanel.tsx`
- `components/olivia/OliviaChatDock.tsx`
- `components/olivia/OliviaChatWorkItemCard.tsx`
- `components/olivia/OliviaCore.tsx`
- `components/olivia/OliviaDashboardPanel.tsx`
- `components/olivia/OliviaInsightCard.tsx`
- `components/olivia/OliviaMeetingPanel.tsx`
- `components/olivia/OliviaPriorityBadge.tsx`
- `components/olivia/OliviaProjectPanel.tsx`
- `components/olivia/OliviaTimeline.tsx`
- `lib/olivia/chatShared.ts`
- `lib/olivia/capabilities/registry.ts`
- `lib/olivia/features/executor.ts`

현재 활성 채팅 UI는 `OliviaWorkspaceShell → OliviaConversation` 단일 인스턴스를 Desktop/Tablet/Mobile host로 portal하는 구조다. `MobileOliviaChat`과 `OliviaChatWindowContent`는 별도 구현이 아니라 host wrapper다. 위 목록은 도달 불가한 레거시 하위 트리지만, 요청서 원칙에 따라 이번 PHASE에서는 삭제하지 않는다.

Backend도 `lib/workflowAutomation.ts`와 `lib/olivia/tools/workflow.ts`가 서로 중복된 엔진은 아니다. 전자가 canonical workflow 엔진이고 후자는 이를 호출하는 Olivia tool adapter이며 양쪽 모두 현재 import된다. 삭제 대상이 아니다.

### 사진·Worker 특수 로딩

- `lib/photo-classifier/workers/feature-worker.ts` — 정적 import는 없지만 `feature-worker-client.ts`의 `new Worker(new URL(...))`로 로드되므로 **사용 중**이다.
- `lib/photo-classifier/file-move.ts` — import 0개지만 사진 파이프라인 안전 코드이므로 별도 검토 전 삭제하지 않는다.

### 기타 보류

- `app/website-builder/templates/medihome.ts` — 현재 import 0개지만 템플릿 데이터 보존 여부 확인 필요.
- `components/reviews/ReviewAutomationPanel.tsx` — 새 리뷰 UI와 기능 비교 필요.
- `components/work-journal/TaskDetailPanel.tsx`
- `components/work-journal/TaskListColumn.tsx`

## 앱 UI에서 도달 불가한 페이지 최종 결과

아래는 Desktop registry, Dock, `ALL_TOOLS` 앱 그리드, Tablet 앱 목록, Mobile navigation 어디에도 없다.

| 경로 | 현재 확인된 보조 진입점 | 판정 |
|---|---|---|
| `/channel-audit` | legacy Olivia 허용 경로 목록 | 유지/분류 필요 |
| `/content-calendar` | legacy Olivia 허용 경로 목록 | 유지/분류 필요 |
| `/instagram-promo-design` | legacy Olivia 허용 경로 목록 | 유지/분류 필요 |
| `/sns-design` | legacy Olivia 허용 경로 목록 | 유지/분류 필요 |
| `/variation` | legacy Olivia 허용 경로, 실제 `/api/variation` 사용 | 유지/분류 필요 |
| `/team/chat` | `/team` redirect | 호환 redirect로 유지 |
| `/team/goals` | `/team` redirect | 호환 redirect로 유지 |
| `/team/reports` | `/team` redirect | 호환 redirect로 유지 |
| `/team/today` | `/team` redirect | 호환 redirect로 유지 |

앞의 다섯 경로는 앱 UI에는 없지만 Olivia의 legacy feature route 목록에 포함되어 있으므로 도달 불가만으로 삭제하면 안 된다. `/select/demo`는 승인 후 삭제했다. `/team/*` 네 경로는 현재 통합 `/team` 화면으로 보내는 호환 redirect라 유지했다.

## API route 판정

이번 정적 분석으로 즉시 삭제해도 안전하다고 증명된 API route는 없다. API route는 내부 import가 없어도 webhook, cron, Mac Studio Worker 또는 외부 공유 링크에서 직접 호출될 수 있다. 따라서 내부 문자열 참조가 없다는 이유만으로 삭제하지 않는다.

## 최종 검증

- `npm run typecheck`: 통과
- `npm test`: 176개 파일, 1,241개 테스트 통과
- `npm run build`: 통과 (기존 lint warning은 남아 있으나 build error 없음)
- `git diff --check`: 통과
- 삭제한 API route: 없음
- 중복·레거시 구현: 목록만 보존, 삭제 없음
- 기존 사용자 작업 파일: 스테이징 및 커밋 대상에서 제외
