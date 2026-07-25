# PCRM 3차 갤러리·셀렉·수정·최종 납품 설계

작성일: 2026-07-25

## 1. 목표

PCRM 안에서 고객이 사진을 선택하고, 사진 위에 수정 위치를 표시하며, 최신 수정본을 확인하고 최종 납품을 승인하는 흐름을 완성한다.

전체 흐름:

`관리자 갤러리 공개 → 고객 사진 선택 → 선택 완료 → RAW 매칭/보정 → 수정본 공개 → 사진별 수정 요청 → 최신 수정본 재공개 → 고객 최종 승인 → 리뷰·PER`

기존 셀렉 갤러리와 RAW 매칭 엔진을 폐기하거나 복제하지 않는다. PCRM은 기존 데이터 엔진 위에 고객용 권한, 화면, 상태 전이와 활동 기록을 추가한다.

## 2. 확정된 제품 규칙

- 사진 셀렉은 외부 링크가 아니라 PCRM 고객 화면 안에 완전히 통합한다.
- 고객은 선택 완료 후에도 언제든 선택을 수정하고 다시 제출할 수 있다.
- 재제출 이력은 삭제하지 않으며 최신 제출만 현재 작업 대상으로 사용한다.
- 사진 수정 요청은 확대 이미지 위 좌표 마커와 텍스트 의견을 함께 저장한다.
- 고객 화면에는 최신 수정본만 표시한다.
- 이전 수정본은 복구와 감사 목적으로 보존하되 고객에게 노출하지 않는다.
- 관리자가 최종 파일을 공개한 것만으로 완료 처리하지 않는다.
- 고객이 `최종 승인`을 눌러야 납품 단계가 완료된다.
- 최종 승인 후 기존 리뷰 콘텐츠와 PER 흐름으로 이동한다.

## 3. 구현 접근

기존 셀렉 데이터에 PCRM 어댑터 계층을 추가한다.

재사용하는 구조:

- `select_galleries`: 셀렉 갤러리 원본과 상태
- `select_gallery_images`: 고객에게 보여줄 JPG 이미지
- `client_photo_selections`: 제출된 고객 선택 이력
- `select_raw_matches`: 최신 선택의 RAW 매칭 결과
- `photo_galleries`: 원본, 보정본, 최종본 갤러리
- `client_revision_requests`: 수정 요청 원본
- `pcrm_publications`: 고객 공개, 열람, 수정 요청, 승인 상태
- `pcrm_activity_logs`: 관리자, 고객, 시스템 활동
- 기존 워크플로우 자동 진행과 `/select-galleries` 관리자 작업실

새로운 PCRM 전용 갤러리 원본 테이블을 만들지 않는다. 기존 관리자 작업실은 파일 업로드와 RAW 매칭 도구로 유지하고, 관리자 PCRM은 고객 상태와 다음 행동을 관리하는 화면으로 사용한다.

## 4. 데이터 구조

### 4.1 선택 초안

`pcrm_selection_drafts`

- `id`
- `client_id`
- `workflow_run_id`
- `gallery_id`
- `selected_image_ids`
- `favorite_image_ids`
- `image_notes`
- `customer_memo`
- `created_at`
- `updated_at`
- 프로젝트와 갤러리 조합당 현재 초안 1개

선택과 즐겨찾기는 자동 저장한다. 초안 저장은 제출 이력을 만들거나 워크플로우를 이동시키지 않는다.

### 4.2 선택 제출 이력

제출 시 기존 `client_photo_selections`에 새 행을 추가한다.

- 과거 선택을 삭제하지 않는다.
- 가장 최근 `submitted_at` 행을 현재 선택으로 사용한다.
- `select_galleries.selected_count`, `submitted_at`, `status`는 최신 결과의 캐시다.
- PCRM 제출은 기존 `allow_resubmit` 값과 관계없이 재제출을 허용한다.
- 기존 외부 셀렉 링크의 `allow_resubmit` 동작은 변경하지 않는다.

### 4.3 사진 수정 마커

`pcrm_photo_annotations`

- `id`
- `client_id`
- `workflow_run_id`
- `gallery_id`
- `image_id`
- `revision_request_id`
- `marker_number`
- `x_ratio`
- `y_ratio`
- `content`
- `status`
- `admin_reply`
- `resolved_at`
- `created_at`
- `updated_at`

`x_ratio`, `y_ratio`는 이미지 원본 크기와 무관한 `0~1` 좌표다. 상태는 `draft`, `submitted`, `in_progress`, `resolved`만 사용한다.

한 사진에 여러 마커를 만들 수 있다. 마커 삭제는 제출 전까지만 허용하고, 제출 후 변경은 새로운 수정 요청으로 기록한다.

### 4.4 최종 납품 확인

`pcrm_delivery_confirmations`

- `id`
- `client_id`
- `workflow_run_id`
- `publication_id`
- `gallery_id`
- `viewed_at`
- `first_downloaded_at`
- `last_downloaded_at`
- `download_count`
- `approved_at`
- `approved_by`
- `approval_statement`
- `created_at`
- `updated_at`

최종본 원본은 `photo_galleries`와 `pcrm_publications`를 사용한다. 확인 테이블은 열람, 다운로드, 최종 승인만 기록한다.

### 4.5 첨부파일

기존 `pcrm_attachments`의 허용 대상을 사진 수정 마커와 사진 수정 요청으로 확장한다. 기존 비공개 Storage와 서명 업로드 방식을 유지한다.

## 5. 상태와 자동 진행

고객 갤러리 상태:

`gallery_published → selecting → selection_submitted → raw_matching → retouching → revision_requested → final_published → final_viewed → final_approved`

워크플로우 연결:

- 셀렉 갤러리 공개: 기존 `client_selection`
- 고객 선택 제출: `raw_matching`
- RAW 매칭 완료: 기존 자동화로 `retouching`
- 사진 수정 요청 제출: `revision`
- 수정본 공개: 고객 재확인 대기
- 최종 납품 공개: `final_delivery`
- 고객 최종 승인: 납품 확인 완료 후 `review_content`
- 이후 기존 리뷰와 PER 단계 유지

고객이 선택을 재제출하면:

1. 새 `client_photo_selections` 행 생성
2. 최신 선택 캐시 갱신
3. 기존 RAW 매칭 결과는 현재 선택의 결과로 재사용하지 않음
4. 워크플로우를 `raw_matching`으로 이동
5. 관리자에게 재매칭 필요 상태 표시
6. 활동 기록에 이전 선택 수와 새 선택 수 저장

이미 보정 작업이 시작된 뒤 재제출해도 서버는 허용한다. 다만 고객에게 재작업과 일정 변경이 생길 수 있다는 확인 문구를 표시한다.

## 6. 고객 화면

기존 `/client-portal/gallery`를 하나의 갤러리 작업 공간으로 확장한다.

상단 단계:

1. 원본 셀렉
2. 보정본 확인
3. 수정 요청
4. 최종 납품

### 6.1 원본 셀렉

- 전체, 선택, 즐겨찾기 필터
- 반응형 사진 그리드
- 썸네일 지연 로딩
- 사진 확대
- 사진 선택 체크
- 즐겨찾기
- 사진별 메모
- 전체 메모
- 현재 선택 수
- 자동 저장 상태
- 선택 완료
- 제출 후 선택 수정과 재제출

선택 수 제한이 기존 갤러리에 정의되어 있다면 해당 값을 표시하고 서버에서 검증한다. 제한 정보가 없으면 최소 1장 선택만 요구한다.

### 6.2 보정본과 수정 요청

- 최신 보정본만 표시
- 전체, 수정 요청, 처리 완료 필터
- 사진 확대
- 이미지 위치 클릭으로 오렌지 마커 생성
- 마커 번호와 수정 내용 입력
- 제출 전 마커 이동과 삭제
- 사진 전체 의견
- 참고 파일 첨부
- 전체 수정 요청 제출

### 6.3 최종 납품

- 최신 최종본만 표시
- 사진 확대
- 개별 다운로드
- 전체 다운로드 또는 외부 NAS 링크
- 열람 및 다운로드 상태
- 최종 승인 전 확인 문구
- 최종 승인 버튼
- 승인 시간과 완료 상태

최종 승인 후에도 파일 다운로드는 유지한다. 추가 수정은 자동으로 열지 않고 별도 수정 요청으로 접수한다.

## 7. 관리자 화면

고객 상세의 기존 협업 패널에 `갤러리·납품` 영역을 추가한다.

- 셀렉 갤러리 공개와 공개 취소
- 고객 선택 수
- 최근 제출 시간
- 선택 재제출 횟수
- 이전 제출 대비 추가·제외 사진 수
- RAW 매칭 진행 상태
- 사진별 수정 마커
- 고객 수정 내용
- 관리자 답변과 처리 완료
- 최신 수정본 공개
- 최종 납품 공개
- 고객 열람, 다운로드, 최종 승인 상태
- 다음 해야 할 일

세부 파일 업로드와 RAW 매칭은 기존 `/select-galleries` 작업실로 이동한다. PCRM 안에 동일한 관리자 파일 도구를 중복 구현하지 않는다.

## 8. API

### 고객

- `GET /api/client-portal/gallery-workspace`
- `PUT /api/client-portal/gallery-workspace/draft`
- `POST /api/client-portal/gallery-workspace/submit`
- `GET /api/client-portal/photo-annotations`
- `POST /api/client-portal/photo-annotations`
- `PATCH /api/client-portal/photo-annotations/[id]`
- `DELETE /api/client-portal/photo-annotations/[id]`
- `POST /api/client-portal/photo-revisions/submit`
- `POST /api/client-portal/final-delivery/view`
- `POST /api/client-portal/final-delivery/download`
- `POST /api/client-portal/final-delivery/approve`

### 관리자

- `GET /api/admin/pcrm/gallery-workspace`
- `POST /api/admin/pcrm/gallery-publications`
- `PATCH /api/admin/pcrm/photo-annotations`
- `POST /api/admin/pcrm/final-delivery`
- `GET /api/admin/pcrm/delivery-status`

기존 API를 호출할 수 있는 공통 서비스 계층을 만들고, API 간에 선택 제출·상태 전이·활동 기록 로직을 복제하지 않는다.

## 9. 선택 제출의 원자성

선택 제출은 서버 함수 또는 트랜잭션 RPC로 처리한다.

1. 포털 토큰의 고객과 프로젝트 확인
2. 공개된 갤러리인지 확인
3. 파일 만료 여부 확인
4. 선택 이미지가 모두 해당 갤러리에 속하는지 확인
5. 중복 이미지 제거
6. 새 선택 이력 생성
7. 갤러리 캐시 갱신
8. 기존 현재 RAW 매칭 무효화
9. 워크플로우 이동
10. 활동 기록 생성

동일 요청의 연속 클릭은 요청 키와 버튼 비활성화로 중복 제출을 막는다.

## 10. 보안

- 모든 고객 API는 포털 토큰의 `client_id`, `workflow_run_id`를 사용한다.
- 요청 본문의 고객 또는 프로젝트 ID를 신뢰하지 않는다.
- `select_galleries`, 이미지, 보정본, 최종본이 토큰 프로젝트에 속하는지 확인한다.
- `pcrm_publications`에 공개되지 않은 갤러리는 고객에게 반환하지 않는다.
- 만료된 사진은 선택과 수정 요청을 차단한다.
- 좌표는 유한한 숫자와 `0~1` 범위만 허용한다.
- 수정 내용은 1~2,000자, 전체 메모는 최대 10,000자로 제한한다.
- 파일 형식, 크기, Storage 경로와 연결 대상을 서버에서 검증한다.
- 최종 승인은 현재 공개된 최신 납품본에만 허용한다.
- 최종 승인 중복 실행을 차단한다.
- 서비스 역할 키는 클라이언트에 노출하지 않는다.

## 11. 오류와 빈 상태

- 아직 공개된 셀렉 갤러리가 없습니다.
- 사진 파일 보관 기간이 만료되었습니다.
- 선택한 사진이 없습니다.
- 선택 내용이 자동 저장되지 않았습니다.
- 이전 제출 이후 보정 작업이 시작되었습니다. 다시 제출하면 재작업이 필요할 수 있습니다.
- 아직 공개된 보정본이 없습니다.
- 수정 요청할 위치를 선택해 주세요.
- 아직 최종 납품 파일이 공개되지 않았습니다.
- 이미 최종 승인된 납품입니다.

기술 오류를 고객에게 그대로 노출하지 않는다. 실패한 자동 저장은 화면에 유지하고 재시도할 수 있게 한다.

## 12. 성능과 반응형

- 썸네일 지연 로딩
- 원본 대신 썸네일과 미리보기 우선 사용
- 대량 사진은 점진 렌더링 또는 페이지 단위 로딩
- 선택 상태는 ID 집합으로 관리해 전체 배열 재계산을 줄임
- 자동 저장은 디바운스
- API 응답과 재조회 결과를 ID 기준으로 병합
- 모바일 2열, 태블릿 3~4열, 데스크톱 가변 다열
- 상세 이미지는 화면 안에 맞추고 좌표 마커는 비율 좌표로 렌더링
- 하단 선택 현황과 제출 버튼은 모바일에서 고정 가능
- 페이지 가로 스크롤 금지

## 13. 활동 기록

다음 활동을 `pcrm_activity_logs`에 저장한다.

- 셀렉 갤러리 공개
- 셀렉 갤러리 열람
- 선택 자동 저장은 로그에서 제외
- 최초 선택 제출
- 선택 재제출
- RAW 재매칭 필요
- 보정본 공개
- 수정 마커 제출
- 수정 요청 접수
- 수정 완료
- 최종 납품 공개
- 최종 납품 열람
- 개별 또는 전체 다운로드
- 최종 승인

## 14. 검증 시나리오

1. PCRM에서 사진 선택, 즐겨찾기, 메모 자동 저장
2. 선택 완료 후 선택을 변경하고 재제출
3. 이전 선택 이력 보존과 최신 선택 계산
4. 최신 선택만 RAW 매칭 대상으로 사용
5. 보정 시작 이후 재제출 경고와 재매칭 전환
6. 사진 확대 후 여러 좌표 마커와 의견 저장
7. 관리자가 마커와 의견 확인 후 처리
8. 최신 수정본 재공개
9. 고객에게 이전 수정본이 노출되지 않음
10. 최종 파일 열람과 다운로드 기록
11. 고객 최종 승인 후 납품 단계 완료
12. 최종 승인 중복 실행 차단
13. 고객 A 토큰으로 고객 B 갤러리와 이미지 접근 차단
14. 만료되거나 공개되지 않은 갤러리 접근 차단
15. 데스크톱, 태블릿, 모바일 반응형
16. 대량 사진에서 선택과 스크롤 성능
17. TypeScript, 전체 테스트, 프로덕션 빌드

## 15. 범위에서 제외하는 결정

대표자 결정 전 아래 항목은 자동화하지 않는다.

- 추가 수정 과금과 결제
- 최종 승인 이후 무상 수정 범위
- 장기 파일 보관 기간과 자동 삭제
- 고객별 다운로드 횟수 제한
- 외부 파일 전송 서비스 공급자 변경

구조는 후속 정책을 추가할 수 있게 유지하되 임의의 업무 규칙을 확정하지 않는다.
