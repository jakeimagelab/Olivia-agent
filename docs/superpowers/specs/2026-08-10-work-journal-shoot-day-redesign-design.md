# 업무일지(Work Journal) 촬영 실무 중심 개편 — Phase 1

## Context

현재 `/work-journal` 페이지는 3단 레이아웃(미니 캘린더 | 작업 목록 | 상세 패널)이지만, "작업(team_tasks)"은 촬영과 무관한 범용 업무 관리 개념이다. 사용자는 이 화면을 **촬영 실무 중심**으로 개편해달라고 요청했다 — 특정 촬영 일정을 클릭하면 그 촬영의 To-do·준비물(장비/렌탈)·자료·현장 메모를 한 화면에서 관리하는 구조.

사용자가 20개 섹션의 매우 상세한 스펙(데이터 모델, UI 목업, Phase 1/2/3 우선순위, 디자인 기준)을 직접 작성해 제공했다. 이 문서는 그 스펙을 실제 코드베이스 구조에 맞게 조정한 **Phase 1 실행 설계**다. Phase 2(자료 업로드·PDF/이미지 미리보기·태블릿 메모 연결)와 Phase 3(PDF/이미지 위 필기·PDF 체크리스트 생성·지난 촬영 준비사항 복사)는 이번 스코프에서 명시적으로 제외한다.

## 조사로 확인한 사실

- **`app/work-journal/page.tsx`**(439줄)가 이미 3단 그리드로 존재 — 왼쪽 `MiniCalendar`, 가운데 `TaskListColumn`(자체 `team_tasks` 테이블 기반, todo/in_progress/done 상태 사이클), 오른쪽 `TaskDetailPanel`(체크리스트/파일첨부/우선순위/담당자/메모). 이 셋은 **완전히 새 구조로 교체**하고, `team_tasks` 테이블 자체는 다른 화면에서 쓸 수 있으므로 건드리지 않는다(참조만 끊는다).
- **"일정" 엔티티는 이미 `calendar_tasks` 테이블로 존재**한다(`supabase/setup-calendar.sql` + 이후 마이그레이션들로 `time`/`end_time`/`location`/리마인더 필드 추가됨). 별도 Schedule 테이블을 새로 만들지 않고 이 테이블에 새 하위 테이블들을 `schedule_id`로 연결한다. `client_id`/`project_id` 컬럼은 현재 없음 — Phase 1 스코프 밖(스펙 section 7은 "연동 가능"이라고만 명시, 필수 아님)이므로 이번엔 추가하지 않는다.
- `calendar_tasks.category`는 `'shooting' | 'client' | 'admin' | 'personal' | 'general'` 체크 제약이 이미 있다. **새 To-do/준비사항/렌탈 패널은 `category === 'shooting'` 일정에서만 노출**한다(사용자 확인 완료). 다른 카테고리는 왼쪽 리스트에서 클릭 시 제목/시간/메모만 보이는 단순 카드로 표시.
- **`components/DrawingCanvas.tsx`**(386줄)가 이미 Apple Pencil 압력 감지, undo/redo, 펜/지우개/도형 그리기를 완전히 구현한 상태 — Phase 2에서 현장 메모에 그대로 재사용할 수 있다(Phase 1에는 안 씀).
- **장비 마스터 목록은 코드베이스 어디에도 없다** — 새로 만든다.
- 마이그레이션 컨벤션: `supabase/migrations/YYYYMMDD_설명.sql`, snake_case 테이블/컬럼명, FK는 `{table}_id`.
- 디자인 토큰(`lib/theme.ts`): `C.teal #155855`(주요 강조), `C.orange #E85D2C`(주요 버튼), `C.mint #EAF4F2`(선택 배경), `C.muted #5A7470`(비활성 텍스트), radius는 `R.lg 12px`. 공용 클래스 `.pc-card`, `.pc-btn`, `.pc-tabs` 등을 그대로 사용.
- 드래그앤드롭 라이브러리는 프로젝트에 없음 — 이번 세션에서 견적서 "기타 항목" 순서 변경을 위/아래 화살표 버튼으로 구현했고 별도 의존성 없이 충분했다. To-do 순서 변경도 동일 패턴을 쓴다(진짜 드래그가 필요해지면 다음 차수에 라이브러리 도입 검토).

## 데이터 모델 (Phase 1)

```sql
-- 1) 촬영 준비 To-do (기존 team_tasks/checklist를 work-journal 화면에서 대체)
create table schedule_todos (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references calendar_tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  assignee text,
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_schedule_todos_schedule_id on schedule_todos(schedule_id);

-- 2) 장비 마스터 (전체 촬영 장비 목록, 47개 시드 데이터 포함)
create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('LIGHT','CAMERA','COMPUTER','ETC')),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) 일정별 준비사항 (Equipment 마스터 중 이 촬영에 가져갈 것 + 체크 상태)
create table schedule_equipment (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references calendar_tasks(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  selected boolean not null default false,
  checked boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_id, equipment_id)
);
create index idx_schedule_equipment_schedule_id on schedule_equipment(schedule_id);

-- 4) 렌탈 장비 (일정별 수동 입력, 마스터 DB에 안 들어감)
create table schedule_rentals (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references calendar_tasks(id) on delete cascade,
  name text not null,
  checked boolean not null default false,
  memo text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_schedule_rentals_schedule_id on schedule_rentals(schedule_id);
```

장비 47개 시드는 같은 마이그레이션 파일에 `insert into equipment (name, category, sort_order) values (...)`로 카테고리별 순서대로 넣는다(스펙 section 3 목록 그대로, `DJI Mic Mini 2`는 CAMERA로 지정).

## 화면 구조

```
app/work-journal/page.tsx          — 전면 교체. 3단 그리드 셸 + URL 상태(?date=&schedule=), 새로고침해도 선택 유지
components/work-journal/
  ScheduleColumn.tsx                — 미니 캘린더(기존 MiniCalendar 재활용) + 선택 날짜 일정 리스트, 일정 클릭 가능
  TodoColumn.tsx                    — 진행률 표시 + ScheduleTodo 목록 (category==='shooting'일 때만 렌더)
  PreparationColumn.tsx             — 카테고리 탭(조명/카메라·렌즈/노트북·저장장치/기타, 텍스트만) + 체크리스트 + 렌탈 섹션
  ScheduleDetailCard.tsx            — category !== 'shooting'일 때 가운데에 보이는 단순 카드(제목/시간/메모)
```

- **일정이 `category !== 'shooting'`일 때**: 가운데 칼럼엔 `ScheduleDetailCard`(제목/시간/메모)만 보이고, 오른쪽 칼럼(PreparationColumn)은 렌더하지 않는다 — 그 자리엔 "촬영 일정에서만 준비사항을 관리합니다" 같은 안내만 남긴 빈 카드를 둔다(레이아웃 폭이 갑자기 바뀌지 않게).
- **ScheduleColumn**: 기존 `MiniCalendar`를 그대로 재사용(날짜별 개수 점 표시 이미 구현됨). 일정 리스트만 새로 그린다.
- **TodoColumn**: 체크 토글은 클릭 즉시 PATCH(디바운스 없음 — 항목 수가 적어 quote/contract식 debounce autosave가 불필요). 순서 변경은 위/아래 화살표 버튼.
- **PreparationColumn**: 카테고리 탭 클릭 시 해당 카테고리 장비만 표시, 상단에 `조명 6/17` 형태로 선택 현황. 체크는 클릭 즉시 저장 + 작은 "저장 중.../저장 완료" 텍스트 상태.
- **렌탈 장비**: PreparationColumn 하단, 입력창 + 추가 버튼 + 체크박스 리스트.

## API 라우트

기존 `/api/work-journal/tasks*` 계열은 이 화면에서 더 이상 호출하지 않는다(라우트 파일 자체는 남겨둔다 — 다른 곳에서 team_tasks를 쓸 수 있으므로).

- `GET /api/work-journal/schedule-todos?scheduleId=` / `POST` (생성) / `PATCH /[id]`(완료·순서·담당자·메모) / `DELETE /[id]`
- `GET /api/work-journal/equipment` — 활성 장비 마스터 전체(카테고리별 정렬)
- `GET /api/work-journal/schedule-equipment?scheduleId=` / `PATCH /[id]`(selected·checked·memo)
- `GET /api/work-journal/schedule-rentals?scheduleId=` / `POST` / `PATCH /[id]` / `DELETE /[id]`

## 시각 디자인

기존 톤 그대로, 새 색이나 컴포넌트 스타일을 만들지 않는다.

- 카드: `.pc-card.pc-card--padded`, radius `R.lg`(12px)
- 강조: `C.teal`(#155855) 헤더/활성 텍스트, `C.orange`(#E85D2C) 주요 버튼(추가 등)
- 카테고리 탭: 아이콘 없이 텍스트만(`조명`, `카메라·렌즈`, `노트북·저장장치`, `기타`), 미선택은 `C.muted`, 선택되면 `C.teal` 텍스트 + `C.mint` 배경
- 이모지 아이콘 전면 금지, 체크박스/텍스트 위주, 넓은 여백

## 이번 스코프에서 제외 (Phase 2·3)

- `ScheduleFile`/파일 업로드/PDF·이미지 미리보기 (스펙 section 8)
- `ScheduleMemo`(태블릿 메모, DrawingCanvas 연결) (스펙 section 10·11)
- `FileAnnotation`(PDF/이미지 위 필기) (스펙 section 12·13)
- PDF 체크리스트 생성 (스펙 section 15)
- 지난 촬영 준비사항 불러오기 (스펙 section 16)
- 현장 보기 모드(iPad 전용 레이아웃 전환) (스펙 section 9)
- `calendar_tasks.client_id`/`project_id` 연동 (스펙 section 7)

## 검증 계획

`npx tsc --noEmit`, `npx vitest run`, `npm run build` 통과 확인. 로컬/배포 후 Playwright로: (1) `/work-journal` 페이지가 새 3단 구조로 렌더되는지, (2) 촬영 카테고리 일정 클릭 시 To-do/준비사항 패널이 뜨는지, (3) 다른 카테고리 일정은 단순 카드만 보이는지, (4) 체크 토글·To-do 추가/순서변경·렌탈 추가가 실제 DB에 반영되는지, (5) 새로고침 후 URL의 `?date=&schedule=`로 선택 상태가 복원되는지.
