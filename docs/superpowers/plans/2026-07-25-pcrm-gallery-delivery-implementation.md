# PCRM 3차 갤러리·셀렉·수정·최종 납품 구현 계획

## 목표

기존 셀렉 갤러리와 RAW 매칭 데이터를 유지하면서 고객 PCRM 안에 사진 선택, 사진 좌표 수정 요청, 최신 수정본 확인, 최종 납품 승인을 통합한다.

## 절대 보존 범위

- 기존 `/select-galleries` 관리자 작업실
- 외부 셀렉 링크와 `allow_resubmit` 정책
- `select_gallery_images`, `client_photo_selections`, `select_raw_matches`
- 기존 RAW 매칭 및 워크플로우 자동 진행
- `photo_galleries`, NAS 링크, 갤러리 공개 기능
- 기존 고객 포털 토큰, 프로젝트 범위 검증, 활동 기록

## 작업 1. 기존 데이터 계약 고정

대상:

- `lib/selectGallery.ts`
- `app/api/select/[shareToken]/route.ts`
- `app/api/select-galleries/[id]/submit-web-select/route.ts`
- `app/api/select-galleries/[id]/raw-match/route.ts`
- `app/api/client-portal/gallery/route.ts`
- `app/api/client-portal/revision/route.ts`

구현:

- 최신 선택 계산 기준과 RAW 매칭 연결 방식을 공통 유틸로 분리
- PCRM용 제출이 외부 링크 정책을 바꾸지 않도록 경계 명시
- 갤러리 종류와 공개 상태 매핑 정리

검증:

- 기존 셀렉 관련 테스트 실행
- `npm run typecheck`

## 작업 2. DB 마이그레이션

신규 파일:

- `supabase/migrations/20260725_pcrm_gallery_delivery.sql`

구현:

- `pcrm_selection_drafts`
- `pcrm_photo_annotations`
- `pcrm_delivery_confirmations`
- 프로젝트와 갤러리 중심 인덱스
- `updated_at` 트리거
- 서비스 역할 전용 RLS
- `pcrm_attachments`의 사진 수정 관련 대상 확장
- 선택 제출용 원자적 RPC

RPC 검증:

- 토큰 서버가 전달한 고객·프로젝트와 갤러리 일치
- 공개 상태
- 만료 여부
- 이미지 소속
- 중복 이미지 제거
- 선택 이력 추가
- 갤러리 최신 캐시 갱신
- 현재 RAW 매칭 무효화
- 워크플로우 `raw_matching` 이동

검증:

- SQL 정적 검토
- `npm run typecheck`

## 작업 3. 공통 타입·검증·상태 유틸

신규 또는 수정:

- `lib/pcrm/galleryTypes.ts`
- `lib/pcrm/galleryValidation.ts`
- `lib/pcrm/galleryState.ts`
- `lib/pcrm/galleryServer.ts`
- `lib/pcrm/galleryValidation.test.ts`
- `lib/pcrm/galleryState.test.ts`

구현:

- 갤러리 단계와 상태 라벨
- 선택 ID 집합 정규화
- 좌표 `0~1` 검증
- 메모와 수정 내용 길이 검증
- 최신 공개 갤러리 선택
- 선택 재제출 차이 계산
- 프로젝트 소유권 확인

검증:

- 신규 단위 테스트
- `npm run typecheck`

## 작업 4. 고객 갤러리 작업 공간 조회

신규 API:

- `GET /api/client-portal/gallery-workspace`

구현:

- 프로젝트 토큰 검증
- 공개된 셀렉 갤러리만 조회
- 만료 상태
- 썸네일과 미리보기
- 최신 선택과 자동 저장 초안
- 최신 보정본
- 최신 최종 납품본
- 수정 마커와 납품 확인 상태

응답은 고객 화면에 필요한 최소 필드만 반환한다.

검증:

- 고객 A 토큰으로 고객 B 데이터 차단 테스트
- 공개되지 않은 갤러리 제외
- 만료 갤러리 상태 테스트
- `npm run typecheck`

## 작업 5. 선택·즐겨찾기 자동 저장

신규 API:

- `PUT /api/client-portal/gallery-workspace/draft`

구현:

- 선택 사진, 즐겨찾기, 사진별 메모, 전체 메모 저장
- 500~800ms 클라이언트 디바운스
- 마지막 저장 시간과 저장 실패 상태 표시
- 실패 시 로컬 UI 선택은 유지

고객 컴포넌트:

- `GalleryWorkspace.tsx`
- `GalleryToolbar.tsx`
- `PhotoSelectionGrid.tsx`
- `PhotoSelectionCard.tsx`
- `SelectionSummaryBar.tsx`

검증:

- 중복 선택 제거
- 빠른 연속 변경 시 마지막 상태 저장
- 모바일 가로 넘침 확인
- `npm run typecheck`

## 작업 6. 선택 제출과 재제출

신규 API:

- `POST /api/client-portal/gallery-workspace/submit`

구현:

- 최소 1장 선택
- 요청 키 기반 중복 제출 차단
- 원자적 RPC 호출
- 최초 제출과 재제출 활동 기록 구분
- 이전 선택 대비 추가·제외 수 계산
- 보정 시작 이후 재제출 경고 모달
- 제출 후에도 `선택 수정` 허용

기존 `client_photo_selections`는 삭제하지 않고 새 이력을 추가한다.

검증:

- 최초 제출
- 동일 요청 중복 클릭
- 제출 후 선택 변경과 재제출
- RAW 재매칭 대기 전환
- 외부 셀렉 링크 정책 회귀 테스트

## 작업 7. 사진 확대와 좌표 마커

신규 API:

- `GET /api/client-portal/photo-annotations`
- `POST /api/client-portal/photo-annotations`
- `PATCH /api/client-portal/photo-annotations/[id]`
- `DELETE /api/client-portal/photo-annotations/[id]`

신규 컴포넌트:

- `PhotoDetailDialog.tsx`
- `PhotoAnnotationLayer.tsx`
- `PhotoAnnotationMarker.tsx`
- `PhotoAnnotationEditor.tsx`

구현:

- 이미지 실제 표시 영역 기준 좌표 계산
- 비율 좌표 저장
- 마커 번호 자동 부여
- 마커 이동, 내용 수정, 삭제
- 제출된 마커 임의 삭제 차단
- 키보드와 모바일 터치 대응

검증:

- 좌표 범위 테스트
- 다른 화면 비율에서 같은 위치 렌더링
- 이미지 밖 클릭 무시
- 고객 A가 고객 B 마커 수정 차단
- `npm run typecheck`

## 작업 8. 사진별 수정 요청 제출

신규 API:

- `POST /api/client-portal/photo-revisions/submit`

구현:

- 제출할 마커와 사진 전체 의견 검증
- 기존 `client_revision_requests`에 대표 수정 요청 생성
- 마커를 수정 요청과 연결
- `agent_tasks` 검토 업무 생성
- 워크플로우 `revision` 이동
- 활동 기록 생성
- 연속 제출 방지

관리자 답변은 기존 수정 요청 상태와 마커 상태를 함께 갱신한다.

검증:

- 마커 없는 제출 거부
- 수정 요청과 관리자 업무 생성
- 활동 기록
- `npm run typecheck`

## 작업 9. 관리자 갤러리·납품 패널

신규 API:

- `GET /api/admin/pcrm/gallery-workspace`
- `POST /api/admin/pcrm/gallery-publications`
- `PATCH /api/admin/pcrm/photo-annotations`
- `POST /api/admin/pcrm/final-delivery`
- `GET /api/admin/pcrm/delivery-status`

신규 컴포넌트:

- `PcrmGalleryDeliveryPanel.tsx`
- `PcrmSelectionStatus.tsx`
- `PcrmSelectionDiff.tsx`
- `PcrmAnnotationInbox.tsx`
- `PcrmDeliveryStatus.tsx`

구현:

- 고객 상세 협업 패널에 갤러리·납품 탭 추가
- 셀렉 공개
- 선택 수, 제출 이력, 이전 대비 변경 수
- RAW 매칭 상태
- 사진 마커와 고객 의견
- 관리자 답변과 해결 처리
- 최신 수정본 공개
- 최종 납품 공개
- 기존 작업실 이동 버튼

검증:

- 관리자 다음 행동 표시
- 고객 데이터와 관리자 상태 일치
- `npm run typecheck`

## 작업 10. 최신 수정본과 최종 납품

고객 API:

- `POST /api/client-portal/final-delivery/view`
- `POST /api/client-portal/final-delivery/download`
- `POST /api/client-portal/final-delivery/approve`

구현:

- `pcrm_publications`에서 최신 공개 수정본과 최종본만 반환
- 이전 공개본은 고객 응답에서 제외
- 열람 시간
- 개별 및 전체 다운로드 기록
- 최종 승인 확인 모달
- 최종 승인 중복 차단
- 승인 후 납품 완료와 `review_content` 이동
- 승인 후 다운로드 유지

고객 컴포넌트:

- `RetouchedGalleryPanel.tsx`
- `FinalDeliveryPanel.tsx`
- `FinalApprovalDialog.tsx`

검증:

- 이전 수정본 미노출
- 최신본 다운로드
- 최종 승인
- 중복 승인 차단
- 승인 후 리뷰 단계 이동

## 작업 11. 고객 갤러리 페이지 통합

수정:

- `app/client-portal/gallery/page.tsx`
- `app/client-portal/dashboard/page.tsx`
- `app/api/client-portal/dashboard/route.ts`
- `app/globals.css`

구현:

- 원본 셀렉, 보정본 확인, 수정 요청, 최종 납품 단계 UI
- 고객 홈의 오늘 해야 할 일 연결
- 선택 대기, 수정 확인, 최종 승인 우선순위
- Olivia 기존 폰트와 디자인 토큰 유지
- 모바일 2열, 태블릿 3~4열, 데스크톱 가변 다열
- 썸네일 지연 로딩과 점진 렌더링

검증:

- 데스크톱·태블릿·모바일 브라우저 확인
- 가로 스크롤 없음
- 터치 영역 최소 44px

## 작업 12. 전체 회귀 검증

명령:

```bash
npm run typecheck
npm run test
npm run build
```

브라우저:

- 고객 원본 셀렉
- 재제출 경고
- 사진 마커 편집
- 관리자 마커 확인
- 최신 수정본
- 최종 승인
- 모바일 레이아웃
- 콘솔 주요 오류 확인

## 작업 13. Git 정리

- 관련 파일만 `git add`
- 기존 미추적 파일 제외
- 설계와 구현을 분리해 커밋
- 푸시와 배포는 사용자 요청 전까지 하지 않음

## 대표자 결정 전 보류

- 추가 수정 과금 및 결제
- 최종 승인 후 무상 수정 범위
- 장기 파일 보관 및 자동 삭제
- 다운로드 횟수 제한
- 외부 파일 전송 서비스 변경
