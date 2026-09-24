# 촬영 진행 카드·워크플로 연결 설계

## 범위와 순서

이 설계는 기존 18개 워크플로 단계 카탈로그, 활성 12단계 UI, 사진 저장 파이프라인, 고객 포털을 재사용한다. 새 상태 머신이나 새 포털을 만들지 않는다.

구현은 다음 순서로 분리하며 각 단계가 끝날 때 검증한다.

1. 자동 단계 이동과 촬영 건 연결
2. 데스크탑·모바일 홈 진행 카드
3. 고객관리 작업 팝업
4. 고객관리 네이티브 화면 경로 확인
5. 남은 iframe 목록화와 공통 실패 처리

## 핵심 데이터 모델

`photo_storage_projects`를 촬영 건의 기본 식별자로 사용한다. 촬영 일정 또는 고객 워크플로를 찾지 못해도 사진 프로젝트는 독립적으로 진행할 수 있다.

기존 테이블에는 관계만 추가한다.

- `photo_storage_projects.workflow_run_id`: 선택적으로 연결된 기존 워크플로 런
- `photo_storage_projects.calendar_task_id`: 선택적으로 연결된 기존 촬영 일정
- `select_galleries.photo_storage_project_id`: 워크플로 런이 없어도 갤러리를 촬영 건에 직접 연결

관계 컬럼은 nullable이며 기존 행과 기존 흐름을 깨지 않는다. 상태의 근거는 기존 필드와 기존 행이다.

- 사진 분리·분류: `photo_storage_projects.status`
- 원본 전달과 셀렉: `select_galleries.status`, `nas_link`, `submitted_at`
- RAW 매칭: 기존 `remote_jobs`의 `PHOTO_RAW_MATCH` 상태
- 고객 업무 흐름: 기존 `workflow_runs`, `workflow_step_runs`

별도의 중복 진행 상태 컬럼은 만들지 않는다.

## 화면에 표시할 실제 단계

활성 12단계의 `workflow_runs.current_step_key`만으로 화면을 결정하지 않는다. 카드와 팝업이 공통으로 사용할 촬영 진행 해석기가 다음 데이터를 함께 읽는다.

1. 연결된 사진 프로젝트 상태
2. 연결된 셀렉 갤러리 상태
3. 최근 RAW 매칭 잡 상태
4. 연결된 경우 `workflow_step_runs`의 내부 단계 상태

표시 단계는 다음과 같이 결정한다.

- 분리·씬 분류 진행 전/진행 중: `backup_sorting`
- 씬 분류 완료, 유그린 링크 미등록: `original_delivery`
- 링크 등록 후 고객 제출 전: `client_selection`
- 고객 제출 후 RAW 매칭 완료 전: `raw_matching`
- RAW 매칭 완료 후: `retouching`
- 이후 단계: 기존 워크플로 상태

따라서 활성 12단계 UI에서 `original_delivery`와 `raw_matching`이 접혀 있어도 홈 카드와 작업 팝업에서는 각각 독립된 현재 할 일로 표시된다.

## 폴더·일정·워크플로 연결

폴더명의 선행 `MMDD`를 촬영일 후보로 해석한다. 감지 시각을 기준으로 인접 연도를 포함한 날짜 후보를 만들고, 해당 날짜의 `calendar_tasks.category = 'shooting'` 일정만 비교한다.

폴더명에서 날짜 접두어를 제거한 이름과 다음 값을 정규화해 비교한다.

- 캘린더 제목과 장소
- 활성 워크플로의 고객명과 프로젝트명
- 워크플로의 `shoot_date`

하나의 일정과 하나의 워크플로로 안전하게 확정될 때만 관계를 저장한다. 후보가 없거나 여러 개인 경우 임의 연결하지 않는다.

매칭 실패는 오류가 아니다. NAS 감지 시 `photo_storage_projects` 행을 폴더 기준으로 생성하고 `workflow_run_id`, `calendar_task_id`를 null로 유지한다. 이 행은 홈 카드에 표시되며 이후 팝업에서 고객 또는 워크플로를 연결할 수 있다.

## 자동 단계 이동

모든 전환은 기존 `advanceWorkflow()`와 `workflow_step_runs`를 재사용하고, 현재 단계 가드로 중복 보고를 무해하게 처리한다.

### NAS 폴더 감지

- 폴더 프로젝트를 생성 또는 재사용한다.
- 일정과 워크플로가 확정되면 관계를 저장한다.
- 연결된 워크플로가 `shooting`이면 이를 완료하고 `backup_sorting`으로 이동한다.
- 연결되지 않아도 사진 프로젝트는 그대로 진행한다.

### 씬 분류 완료

- 사진 프로젝트를 `CLASSIFY_COMPLETED`로 갱신한다.
- 연결된 워크플로의 `backup_sorting`을 완료하고 활성 12단계의 `client_selection`으로 이동한다.
- `workflow_step_runs.original_delivery`를 `in_progress`로 연다.
- 화면 해석기는 이를 `original_delivery`로 표시한다.

### 유그린 링크 등록

- 기존 `select_galleries` 행을 사진 프로젝트에 연결해 생성 또는 재사용한다.
- 워크플로가 없어도 생성할 수 있다.
- `original_delivery` 내부 단계를 완료하고 `client_selection`을 진행 중으로 둔다.

### 고객 셀렉 제출

- 기존 제출 API와 RPC가 셀렉 이력을 저장한다.
- 연결된 워크플로가 있으면 `client_selection` 내부 처리를 완료하고 `raw_matching` 내부 단계를 연다.
- 워크플로가 없어도 갤러리 상태로 카드가 `raw_matching`을 표시한다.

### RAW 매칭 완료

- 기존 `PHOTO_RAW_MATCH` 잡 완료를 근거로 한다.
- 연결된 워크플로가 있으면 `raw_matching` 내부 단계를 완료하고 기존 `advanceWorkflow()`로 `retouching`에 진입한다.
- 워크플로가 없으면 잡 완료 사실로 카드가 `retouching`을 표시한다.

## 오류와 동시성

- 매칭이 모호하면 관계만 비워두며 사진 파이프라인은 중단하지 않는다.
- 기존 상태와 동일한 완료 보고는 no-op으로 처리한다.
- 워커 보고 실패가 파일 작업 결과를 되돌리거나 새 잡을 만들지 않는다.
- 관계 저장과 워크플로 이동 실패는 구조화된 로그를 남기되 사진 프로젝트의 완료 상태를 훼손하지 않는다.
- 링크·외래키 컬럼에는 조회 인덱스를 둔다.

## PHASE 2 검증

- 단일 촬영 일정과 폴더가 매칭되면 `shooting`에서 `backup_sorting`으로 이동한다.
- 다중 후보 또는 무후보는 연결하지 않고 폴더 프로젝트만 생성한다.
- 씬 분류 완료 시 내부 `original_delivery`가 열리고 표시 단계가 링크 등록 대기가 된다.
- 셀렉 제출 시 내부 `raw_matching`이 열린다.
- RAW 잡 완료 시 연결된 런은 `retouching`으로 이동한다.
- 워크플로 런이 없는 프로젝트도 같은 표시 단계를 계산한다.
- 중복 워커 보고가 단계나 로그를 중복 생성하지 않는다.

## 비범위

- `lib/workflow.ts`의 단계 키나 활성 12단계 정의 변경
- 새 고객 포털 또는 새 사진 파이프라인
- 유그린 링크 자동 생성
- 카드와 팝업의 시각 구현은 PHASE 3·4에서 진행
- iframe 화면 전환은 목록 승인 이후 진행
