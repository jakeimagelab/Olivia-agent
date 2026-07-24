# PCRM 기반 구축 구현 계획

## 1. 데이터 기반

- `supabase/migrations/20260725_pcrm_foundation.sql`
  - `workflow_runs` 프로젝트 메타데이터 보강
  - `client_portal_access.workflow_run_id` 추가
  - `client_portal_events.workflow_run_id` 추가
  - `pcrm_publications`, `pcrm_activity_logs` 추가
  - 인덱스, 제약, RLS, updated_at 트리거 추가
- `lib/pcrm/types.ts`
  - 프로젝트, 공개 상태, 활동, 포털 대시보드 타입
- `lib/pcrm/clientWorkflow.ts`
  - 내부 워크플로우를 고객용 10단계와 다음 행동으로 매핑
- 유틸 단위 테스트 작성

## 2. 서버 API

- 고객 생성 API에서 자동 워크플로우 생성을 제거
- 기존 `/api/clients/[id]/workflow`를 프로젝트 생성 API로 보강하고 입력 검증
- 포털 접근 생성·조회·폐기를 프로젝트 단위로 변경
- `validatePortalToken`이 토큰에 연결된 프로젝트만 반환하도록 변경
- 기존 고객 단위 토큰은 최신 프로젝트 선택으로 호환
- 고객 대시보드 API의 모든 프로젝트 관련 쿼리를 세션 범위로 제한
- 프로젝트 활동 기록 공통 유틸 및 관리자 조회 API 추가

## 3. 관리자 PCRM

- 기존 `/clients` 데이터 호출과 액션을 유지
- 목록·상세에서 복수 프로젝트 선택 가능하게 변경
- 참고 이미지와 Olivia 토큰을 기준으로 다음 컴포넌트 추가
  - 요약 카드
  - 프로젝트 현황
  - 승인 대기
  - 오늘 일정
  - 최근 활동
  - 포털 접근 카드
- 기존 대형 페이지를 한 번에 재작성하지 않고 신규 컴포넌트를 단계적으로 연결

## 4. 고객 PCRM

- `PortalShell`을 PhotoClinic 상단형 포털로 리팩터링
- 고객용 워크플로우 진행 컴포넌트 추가
- 고객 홈을 프로젝트 히어로, 다음 행동, 승인, 자료, 갤러리, 일정, 메모, PER 구조로 개편
- 기존 gallery, revision, review, per 페이지의 경로와 기능 유지

## 5. 검증

- 고객용 워크플로우 매핑 테스트
- 프로젝트 토큰 범위 테스트 가능한 순수 함수 분리
- `npm run typecheck`
- `npm run test`
- `npm run build`
- 관리자/고객 화면 데스크톱·모바일 브라우저 확인
