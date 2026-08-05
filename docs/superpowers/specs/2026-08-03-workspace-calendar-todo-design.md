# 워크스페이스 할일 — 캘린더 연동 + 항목별 담당자 설계

작성일: 2026-08-03

## 목표

직원에게 업무를 시키는 창구를 워크스페이스 > 할일로 통일한다. 캘린더에 등록된 큰 프로젝트(촬영/고객 일정)를 할일 탭에 자동으로 띄우고, 관리자가 그 프로젝트를 클릭해 세부 업무를 적으면서 항목마다 담당 직원을 지정한다. 직원은 출근해서 워크스페이스를 보고 자기 항목을 체크한다.

## 범위

1. `/team` 워크스페이스 탭 순서 변경 — 할일 탭이 먼저 보이고 기본 탭이 된다.
2. 캘린더(촬영/고객 카테고리) → 워크스페이스 할일 자동 동기화, 중복 생성 방지.
3. 할일(`team_tasks`) 자체에는 담당자를 두지 않는다. 세부 업무(체크리스트 항목) 각각에 담당자를 지정한다.
4. "+ 새 할 일" 다이얼로그를 제목만 입력하는 형태로 단순화한다.
5. 프로젝트 상세에서 세부 업무를 하나씩 입력 + 담당자 선택으로 추가하는 UI.
6. 메인 대시보드(`app/page.tsx`)에 오늘의 할일(워크스페이스) 카드를 추가한다. 기존 캘린더 기반 "오늘 할일" 위젯과는 별개 섹션으로 둔다.

체크리스트 항목별 승인/리뷰 같은 무거운 상태 흐름은 만들지 않는다. 완료 여부는 체크박스 하나로 끝낸다(기존 `team_task_checklists.completed`와 동일).

## 데이터 구조

### 신규 컬럼

- `team_tasks.calendar_task_id uuid references calendar_tasks(id) on delete set null`, unique(부분 인덱스, null 제외) — 캘린더 항목 1개당 워크스페이스 할일 1개만 생기도록 중복 방지.
- `team_task_checklists.assignee_id uuid references chat_members(id) on delete set null` — 체크리스트 항목별 담당자. 태스크 레벨 `team_tasks.assignee_id`는 그대로 두되(다른 화면에서 여전히 쓰임), 캘린더 연동 프로젝트 생성 시에는 값을 넣지 않는다.

### 동기화 규칙

`calendar_tasks`에서 `category in ('shooting','client')`이고 아직 연동된 `team_tasks` 행이 없는 것을 찾아 1:1로 `team_tasks`를 생성한다(`title`, 참고용 `description`에 날짜/장소/메모 요약, `calendar_task_id` 연결, `status='todo'`, `assignee_id=null`). 캘린더 쪽 제목이 바뀌면 다음 동기화 때 연동된 할일 제목도 갱신한다(다른 필드는 관리자가 손댄 값이므로 덮어쓰지 않음). 캘린더 항목이 삭제(휴지통 이동)되면 연동된 할일은 남기되 더 이상 갱신하지 않는다(휴지통 이동은 `calendar_tasks`를 지우지 않고 별도 처리이므로 FK는 유지된다).

동기화는 워크스페이스 할일 목록을 불러올 때(`GET /api/team/tasks`) 서버에서 먼저 한 번 실행한다. 별도 크론은 두지 않는다.

## API 변경

- `GET /api/team/tasks` — 응답 전에 동기화 실행. 응답에 `calendar_task_id`, 체크리스트의 `assignee_id`/`assignee` 포함.
- `GET /api/team/tasks/[taskId]` — 체크리스트에 담당자 정보 포함(`chat_members` 조인).
- `POST /api/team/tasks/[taskId]/checklists` (신규) — 체크리스트 항목 추가. body: `{ content, assigneeId? }`. `sort_order`는 기존 최대값+1.
- `PATCH /api/team/tasks/[taskId]/checklists/[checklistId]` (기존 라우트 확장) — `completed`뿐 아니라 `assigneeId`, `content` 수정도 허용.
- `DELETE /api/team/tasks/[taskId]/checklists/[checklistId]` (신규) — 항목 삭제.
- `app/api/dashboard/route.ts` — `team_tasks`(진행중 + 체크리스트) 쿼리 추가, 응답에 `workspaceTodayTasks` 필드로 포함.

## UI 변경

### 워크스페이스 탭 순서

`components/team-workspace/WorkspacePage.tsx`의 tabs 배열을 `[할 일, 팀채팅]` 순서로 바꾸고, `app/team/page.tsx`의 기본 tab을 `"tasks"`로 바꾼다.

### 새 할일 다이얼로그

`NewTaskDialog.tsx`를 제목 입력 하나 + "만들기" 버튼으로 축소한다. 담당자/설명/체크리스트/프로젝트/마감일/우선순위 입력칸은 제거한다(값은 서버 기본값 사용: priority=normal, status=todo, 나머지 null).

### 태스크 카드 (`TaskCard.tsx`)

담당자 표시를 제거하고, 캘린더 연동 항목은 "📅 캘린더 연동됨 · 날짜" 배지를 보여준다. 체크리스트가 있으면 진행률(`완료/전체`)을 함께 보여준다.

### 상세 패널 (`TaskDetailDrawer.tsx`)

체크리스트 섹션을 읽기 전용 표시에서 편집 가능한 목록으로 바꾼다.

- 각 행: 체크박스 + 내용 + 담당자 배지/드롭다운(정연호/박상욱 등 `chat_members` 목록) + 삭제 버튼.
- 하단에 입력행: 텍스트 입력 + 담당자 드롭다운 + "+ 추가" 버튼.
- 기존 시작하기/확인요청/승인 같은 상태 버튼은 그대로 둔다(태스크 레벨 상태는 이번 설계와 무관하게 유지).

### 메인 대시보드

`app/page.tsx`에 새 섹션 "직원 업무 · 오늘의 할일"을 추가한다. 표시 항목: 완료되지 않은 워크스페이스 할일 중 (a) 오늘 마감이거나 (b) 캘린더 연동 날짜가 오늘인 것. 각 항목은 제목 + 체크리스트 진행률(`n/m`)만 표시하는 요약 카드로, 클릭하면 `/team?tab=tasks&task={id}`로 이동한다. 기존 캘린더 기반 "오늘 할일" 위젯(`TodayTasks` 컴포넌트)은 그대로 둔다.

## 검증

1. `npx tsc --noEmit --incremental false`, `npm run build`, `npx vitest run`
2. 시나리오: 캘린더에 카테고리=고객으로 "미소로한의원 영상편집" 등록 → 워크스페이스 할일 탭에 자동 표시 확인 → 클릭 → 세부 업무 3개(레퍼런스 조사/편집/공유) 각각 다른 담당자로 추가 → 저장 확인 → 메인 대시보드에 오늘 마감/오늘 날짜 항목으로 노출되는지 확인.
3. 회귀: 기존 프로젝트(`team_projects`) 연결 태스크, 팀채팅 탭, 기존 캘린더 위젯이 그대로 동작하는지 확인.
