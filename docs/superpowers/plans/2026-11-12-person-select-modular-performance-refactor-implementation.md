# 사진선택 모듈화·로딩 성능 리팩터링 구현 계획

설계 기준: `docs/superpowers/specs/2026-11-12-person-select-modular-performance-refactor-design.md`

## 공통 실행 규칙

- 기존 UI, API 응답, DB 데이터를 보존한다.
- 한 커밋에는 한 종류의 변경만 넣는다.
- 각 커밋 전에 관련 테스트를 추가하거나 현재 동작을 contract로 고정한다.
- 각 커밋 후 `npx tsc --noEmit`과 사진선택 관련 Vitest를 실행한다.
- UI를 건드린 단계는 1440px과 390px 실제 브라우저로 검증한다.
- 생성물, 캐시, 기존 비관련 변경은 커밋하지 않는다.

## 단계 0 — 기준선과 롤백점

- [x] 기존 작업 전체 checkpoint: `f61430d6`
- [x] 사진선택 24개 파일, 116개 테스트 통과 확인
- [x] 전체 suite의 기존 실패 6개 기록
- [x] 설계 문서 커밋: `f07d7fa8`

## 단계 1 — 공통 selection domain

### 1A. 값 정규화와 판정

- 별점 1~5, 컬러 6~9 정규화 함수를 한 곳에 둔다.
- `isCustomerSelection`, `countCustomerSelection`, ID 집합 생성이 같은 판정을 사용한다.
- Bridge와 RAW의 중복 범위 검사를 공통 함수로 교체한다.
- rating/color/selected 조합 단위 테스트를 추가한다.

커밋: `Extract canonical person selection domain`

### 1B. snapshot adapter

- 기존 공동 draft/selection 응답을 명시적 snapshot으로 변환한다.
- 서버 확정값과 미저장 diff overlay를 순수 함수로 분리한다.
- 구형 selected ID와 rating/color union 호환 테스트를 추가한다.

커밋: `Add person selection snapshot adapters`

## 단계 2 — 관리자 API service 분리

### 2A. 조회 repository

- event, people, image, choices, shared reviewer 쿼리를 책임별 함수로 이동한다.
- 사람별·selection별 grouping을 Map으로 한 번만 만든다.
- route 응답 fixture/contract 테스트를 먼저 추가한다.

커밋: `Extract person select admin repositories`

### 2B. 응답 assembler

- 관리자 상세 응답 조립을 service로 이동한다.
- route에는 인증, 입력 검증, service 호출, 오류 변환만 남긴다.
- 기존 응답 shape가 동일함을 테스트한다.

커밋: `Extract person select admin project service`

## 단계 3 — 관리자 화면 모듈화

### 3A. 데이터와 작업 controller

- 프로젝트 조회/갱신 hook
- remote job polling hook
- RAW 매칭 controller
- 원본/보정본 import controller

커밋은 hook 종류별로 분리한다.

### 3B. 탭 컴포넌트

- 헤더·탭 shell
- 사진 확인
- 고객 셀렉/진행 현황
- 사진 올리기
- 프로젝트 설정

기존 DOM 순서와 CSS class를 유지하고 렌더 테스트를 추가한다.

## 단계 4 — 고객 Bridge 모듈화

### 4A. 탐색·선택 controller

- 폴더/검색/필터/navigation
- focused/active/customer marks 분리
- keyboard handler

### 4B. review/fullscreen controller

- review list, 제외/복원 stack
- fullscreen index, swipe, zoom
- preview race 방지

### 4C. panel 컴포넌트

- folder panel
- photo grid
- preview panel
- bottom bar
- review/fullscreen overlay

각 단계에서 클릭만으로 셀렉이 바뀌지 않는 기존 테스트를 유지한다.

## 단계 5 — 이미지 metadata paging

### 5A. 폴더 manifest

- 프로젝트별 폴더와 사진 수를 URL 없이 반환한다.
- 루트, 전체, 개별 폴더 의미를 명시적 타입으로 정의한다.
- delivered round 폴더 제외 규칙을 공유한다.

### 5B. cursor page API

- `(sort_order, id)` cursor 기반으로 72장씩 조회한다.
- 폴더, 검색, 정렬 조건을 서버에서 적용한다.
- 구버전 전체 metadata 경로는 호환 기간 동안 유지한다.

### 5C. bootstrap

- 프로젝트/권한/manifest/선택 snapshot/첫 page를 병렬 조립한다.
- 첫 화면이 전체 metadata 완료를 기다리지 않게 한다.

## 단계 6 — media URL과 캐시

### 6A. API 분리

- thumbnail batch 최대 72장
- preview single/adjacent 최대 3장
- 요청 프로젝트 소속 검증
- 만료 시 필요한 URL만 재발급

### 6B. client cache

- 진행 중 요청 dedupe
- bounded LRU
- 폴더/검색 변경 시 stale 요청 취소
- 느린 이전 응답이 최신 preview를 덮지 않는 sequence guard

## 단계 7 — grid 가상화

- viewport와 cell 크기로 visible row 계산
- 위/아래 spacer와 overscan 2~3행
- Shift 범위 선택은 전체 정렬 ID 목록을 사용
- 다음 metadata page sentinel을 실제 grid scroll root에 연결
- 1,645장 fixture에서 DOM 카드 150개 이하 테스트

## 단계 8 — 통합 검증

- 공동 classic, 공동 Bridge, 개인 PIN classic
- 관리자 진행 현황, 현재 저장값, 제출본
- RAW 매칭/로우 셀렉 연동
- 보정본 import/수정 요청/다운로드
- 데스크톱 1440/1920, 모바일 360/390/430
- 1,645장 성능 수치 측정
- typecheck, 관련 Vitest, build
- 전체 suite에서 기준선보다 새 실패가 없는지 확인

## 중단·롤백 조건

다음 중 하나가 발생하면 다음 단계로 넘어가지 않는다.

- 기존 API 응답 contract 변경
- 서버 저장 장수와 고객 표시 장수 불일치
- classic 또는 PIN 로그인 회귀
- 사진 파일·선택·제출·주문 데이터 변경
- 관련 Vitest 실패
- 첫 화면 요청량 또는 DOM 수가 이전보다 증가

