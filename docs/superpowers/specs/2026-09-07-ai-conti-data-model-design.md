# Olivia AI 콘티 자동생성 — 1단계 데이터 모델 설계

## 범위

이번 단계는 신규 콘티 생성 시스템의 저장 기반만 추가한다. `ContiBuilder`, 생성 API,
공유 화면, 고객 포털 및 Olivia 도구의 동작은 바꾸지 않는다. 기존 저장본의
`conti_saves.result` JSONB도 삭제하거나 일괄 변환하지 않는다.

## 검토한 접근

1. **추가형 병행 모델(채택)**: 신규 정규화 테이블을 추가하고 기존 JSONB는 호환 계층으로
   유지한다. 안전하고 점진적으로 UI를 전환할 수 있다.
2. JSONB 확장: `conti_saves.result` 안에 새 구조를 넣는다. 구현은 빠르지만 장면 템플릿,
   공간 및 의료진 데이터를 관계형으로 검색·학습하기 어렵다.
3. 즉시 정규화 전환: 기존 JSONB를 신규 테이블로 일괄 이관한다. 중복은 줄지만 현재 공유,
   포털 피드백, PDF/XLSX 및 Olivia 도구가 기존 배열 구조를 직접 사용해 회귀 위험이 크다.

## 데이터 구조

새 Supabase 마이그레이션은 다음 테이블을 추가한다.

- `scene_templates`: 진료과·대분류·장면 키별 시스템 기본값과 사용 횟수
- `hospital_spaces`: 고객 병원의 실제 공간명, 일반 공간 유형 및 층
- `hospital_staff`: 고객 병원의 의료진·직원과 역할·전문분야
- `conti_runs`: 병원, 진료과, 인원 구성 및 체크 항목을 담는 생성 실행 단위
- `conti_groups`: 촬영 동선을 위한 층·구역 그룹
- `conti_scenes`: 실행 결과 장면과 필드별 출처

모든 병원 참조는 실제 런타임 고객 스키마의 안정적인 키인 `public.clients(id)`를 사용한다.
병원 하위 공간·직원은 고객 삭제 시 함께 삭제한다. Run 하위 그룹·장면은 Run 삭제 시 함께
삭제하며, 장면의 템플릿 참조는 시스템 자산 삭제가 과거 결과를 지우지 않도록 `on delete set
null`로 둔다.

`field_sources`는 JSONB이며 앱 타입에서는 각 편집 필드 값을
`template | hospital | ai | user | blank`로 제한한다. DB에는 객체라는 조건과 기본 빈 객체를
두고, 필드 완전성은 생성/저장 서비스에서 검사한다. PostgreSQL 제약식으로 키별 JSON 값을
과도하게 고정하지 않아 이후 필드 추가가 마이그레이션 없이 가능하도록 한다.

## 기존 데이터 호환

`conti_saves`에는 nullable `run_id`와 `schema_version`을 추가한다. 기존 행은
`schema_version = 1`, 신규 정규화 결과와 연결된 행은 `schema_version = 2`로 구분한다.

- 기존 저장본은 현재 `result`를 그대로 읽어 계속 연다.
- 신규 Run도 현재 소비처가 전환되기 전까지 `ContiResult`를 함께 저장한다.
- “이전 콘티에서 시작”으로 가져온 기존 값은 과거 콘티 기반이므로 source를 `template`로 둔다.
- 신규 모델에 없는 기존 `cameraAngle`, `checklist`, `schedule`은 JSONB에서 보존한다.
- 자동 백필은 하지 않는다. 사용자가 기존 콘티를 새 시스템에서 시작할 때 명시적으로 Run으로
  변환한다.

이 방식은 공유 링크와 고객 포털이 사용하는 장면 ID/순서를 유지하며, 단계별 전환 도중에도
기존 자료가 열리지 않는 상황을 방지한다.

## 코드 경계

신규 TypeScript 모델은 `lib/conti/model.ts`에 둔다. 데이터베이스 행 타입,
`FieldSource`, 편집 필드 키 및 Run 집계 타입을 한 곳에서 제공한다.

호환 변환은 `lib/conti/legacyAdapter.ts`의 순수 함수로 분리한다.

- 기존 `ContiResult`를 신규 Run 초안으로 변환
- 신규 Run을 기존 소비처용 `ContiResult`로 투영
- 시간 문자열을 보수적으로 분 단위로 파싱
- 변환할 수 없는 값은 공란과 `blank` 출처로 표시

1단계에서는 저장 API에 이 변환을 연결하지 않는다. 타입과 순수 변환 경계만 마련해 기존
런타임 동작을 유지한다.

## 오류 및 무결성

- 장면 템플릿은 `(specialty, scene_key)`를 unique로 둔다.
- 장면 시간은 null 또는 0 이상의 정수만 허용한다.
- 그룹과 장면 정렬값에 Run 범위 인덱스를 둔다.
- `field_sources`가 객체가 아니면 저장을 거부한다.
- 병원 공간·의료진에는 `hospital_id` 인덱스를 둔다.
- 현재 프로젝트 관례대로 RLS를 활성화하고 service role 정책과 권한을 추가한다.

## 검증

1. 마이그레이션 SQL의 FK, 인덱스, RLS 및 반복 실행 안전성을 검토한다.
2. 기존 `ContiResult` 변환 테스트에서 원본 배열과 기존 전용 필드가 보존되는지 확인한다.
3. 공란 필드가 `blank`, 과거 비어 있지 않은 필드가 `template`로 표시되는지 확인한다.
4. `npm run typecheck`, 관련 테스트, `npm run build`를 실행한다.

## 이번 단계에서 하지 않는 것

- `ContiBuilder` 교체 또는 UI 변경
- 과거 파일 파싱 및 템플릿 적재
- AI 생성 알고리즘 연결
- 고객관리 공간·의료진 편집 UI
- 기존 저장본 자동 백필
- 공유·현장뷰·PDF 변경
