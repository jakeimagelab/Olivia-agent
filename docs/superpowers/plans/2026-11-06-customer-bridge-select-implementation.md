# 고객용 Bridge 및 셀렉 비교 구현 계획

설계 기준: `docs/superpowers/specs/2026-11-06-customer-bridge-select-design.md`

## 단계 1 — DB와 도메인

1. `20261106_customer_bridge_select.sql` additive migration 작성
2. `lib/selectGallery.ts` 타입 확장
3. 고객 선택 상태, A/B 비교, 상대경로 안전 매칭 순수 함수 작성
4. 단위 테스트를 먼저 추가하고 통과

## 단계 2 — 공개 API 보안

1. 토큰 검증·body 제한·rate limit·payload 검증 helper 작성
2. 공개 draft GET/PUT 구현
3. 공개 submit 구현 및 request key 멱등성 연결
4. classic 파일 업로드 공개 경로 구현
5. 기존 공개 GET에 view mode와 draft를 additive하게 포함
6. 관리자 API PATCH allowlist와 토큰 재발급 구현
7. API 동작 테스트

## 단계 3 — 관리자 갤러리 설정

1. 갤러리 생성 화면에 classic/bridge 선택 추가
2. 상세 화면에 현재 방식 변경, 토큰 재발급, Bridge 연결 상태 추가
3. 업로드 시 가능한 상대경로 전달
4. 기존 업로드·메일·제출·RAW UI 회귀 확인

## 단계 4 — 고객 Bridge

1. customer Bridge 컴포넌트와 CSS module 작성
2. ID 기반 누적/숫자/범위/마키 선택 구현
3. 초안 debounce 저장, 로컬 복구, 충돌/실패 상태 구현
4. single/grid/deck 리뷰와 전체화면 구현
5. 모바일 2열·스와이프·safe area 구현
6. `/select/[shareToken]`에서 view mode 분기
7. classic submit/upload를 공개 토큰 API로 이동

## 단계 5 — 관리자 Bridge 비교

1. 현재 폴더와 갤러리의 명시적 연결 UI/API 작성
2. 로컬 directory handle 저장과 원격 virtual path 저장 분리
3. 최신 고객 제출 조회와 안전 매칭 결과 작성
4. A/B 비교 필터와 카드 출처 표시 추가
5. 기존 개인별 행사 import와 신규 갤러리 import를 분리 표기
6. RAW 매칭 승인 전 누락·중복·무효화 상태 표시

## 단계 6 — 검증

1. 관련 Vitest
2. `npm run typecheck`
3. 변경 파일 lint
4. `npm run build`
5. Playwright classic/bridge/관리자 Bridge PC 및 360/390/430px 검증
6. 기존 dirty 파일 제외 후 변경 범위 검토
