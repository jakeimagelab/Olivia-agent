# 사진선택 다중 검토자 협업 구현 계획

작성일: 2026-11-07  
설계: `docs/superpowers/specs/2026-11-07-person-select-multi-reviewer-collaboration-design.md`

## 목표

`project_shared` 사진선택을 검토자별 독립 셀렉으로 확장한다. 검토자 전용 링크, 별점 1~5와 컬러 6~9, 공용 대화, 관리자 NAS 링크를 기존 Customer Bridge와 관리자 프로젝트 화면에 연결한다. 개인별 PIN, classic 화면, 기존 공용 링크와 운영 데이터는 유지한다.

## 1. 데이터 계층

### 파일

- 추가: `supabase/migrations/20261109_person_select_multi_reviewer_collaboration.sql`
- 수정: `lib/person-select/types.ts`

### 작업

1. `person_select_shared_reviewers`와 `person_select_project_messages`를 추가한다.
2. 기존 shared draft/selection/item에 `reviewer_id`와 컬러 레이블을 추가한다.
3. 기존 이벤트 단위 결과는 이벤트마다 생성한 `기존 공동 셀렉` 호환 검토자에 연결한다.
4. draft PK를 `(event_id, reviewer_id)`로, 제출 멱등 키를 `(event_id, reviewer_id, request_key)`로 전환한다.
5. 검토자별 draft 저장과 제출 RPC를 추가하고 서비스 역할만 실행하도록 제한한다.
6. 이벤트에 `nas_download_url`을 추가한다.

## 2. 검토자 인증과 공개 API

### 파일

- 수정: `lib/person-select/sharedPublic.ts`
- 수정: `lib/select-gallery/publicSelection.ts`
- 수정: `app/api/pick/shared/[shareToken]/route.ts`
- 수정: `app/api/pick/shared/[shareToken]/draft/route.ts`
- 수정: `app/api/pick/shared/[shareToken]/submit/route.ts`
- 수정: `app/api/pick/shared/[shareToken]/images/[imageId]/route.ts`
- 추가: `app/api/pick/shared/[shareToken]/messages/route.ts`
- 추가: `app/api/pick/shared/[shareToken]/messages/events/route.ts`

### 작업

1. URL 토큰을 SHA-256 해시로 검토자에 연결한다.
2. 기존 event `shared_token`은 호환 검토자로 해석한다.
3. 모든 draft/submit/message/image 요청을 동일한 검토자 문맥으로 검증한다.
4. 공개 응답에는 현재 검토자 이름·역할과 명시적으로 입력된 NAS 공유 URL만 포함한다.
5. 컬러 6~9를 별점과 별도로 파싱하고 이미지 소유관계를 검증한다.
6. 메시지는 프로젝트 단위로 조회·작성하며 토큰에서 작성자를 결정한다.
7. SSE는 heartbeat와 변경 알림만 제공하고, 클라이언트는 메시지 목록 API를 canonical 원본으로 다시 읽는다.

## 3. 관리자 API와 화면

### 파일

- 수정: `app/api/person-select/[eventId]/route.ts`
- 추가: `app/api/person-select/[eventId]/reviewers/route.ts`
- 추가: `app/api/person-select/[eventId]/reviewers/[reviewerId]/route.ts`
- 추가: `app/api/person-select/[eventId]/reviewers/[reviewerId]/regenerate-token/route.ts`
- 추가: `app/api/person-select/[eventId]/messages/route.ts`
- 수정: `app/(client-hub)/person-select/[id]/page.tsx`
- 수정: `components/person-select/PersonSelectAdmin.module.css`

### 작업

1. 프로젝트 상세 응답에 검토자별 접속·초안·최근 제출·선택 장수와 메시지를 포함한다.
2. 검토자 추가, 이름·역할 수정, 활성화, 링크 재발급 API를 만든다.
3. 토큰 원문은 생성/재발급 응답에서 한 번만 반환하고 DB에는 해시만 저장한다.
4. 설정에서 NAS 공유 URL을 검증·저장한다.
5. `프로젝트 고객 셀렉` 탭에서 검토자별 결과를 전환해 확인한다.
6. `프로젝트 설정`에서 검토자 링크와 NAS URL을 관리한다.
7. 관리자 메시지 전송 UI를 고객 Bridge와 같은 프로젝트 대화에 연결한다.

## 4. Customer Bridge 상태와 조작

### 파일

- 수정: `lib/select-gallery/customerBridge.ts`
- 수정: `components/select-gallery/CustomerBridgeSelect.tsx`
- 수정: `components/select-gallery/CustomerBridgeSelect.module.css`
- 수정: `components/person-select/SharedProjectSelect.tsx`
- 수정: `app/pick/shared/[shareToken]/page.tsx`

### 작업

1. 별점과 컬러 레이블을 독립 상태로 둔다.
2. 1~5는 별점, 6~9는 관리자 Bridge 색상, 0은 둘 다 해제한다.
3. 고객 셀렉 집합은 별점 또는 컬러 레이블이 있는 사진의 합집합으로 계산한다.
4. 리뷰 제외/복원은 별점·컬러를 함께 복원한다.
5. 썸네일·미리보기·전체화면에 컬러 표시와 컬러 조작을 추가한다.
6. 오른쪽 패널을 `미리보기 | 대화` 밑줄형 두 단계 탭으로 만든다.
7. 대화 탭은 SSE 재연결과 제한된 폴링 fallback을 사용한다.
8. NAS URL이 있을 때만 상단 보조 버튼 `원본 다운로드`를 표시한다.
9. 하단의 유일한 채운 주 실행은 기존 `최종 제출`로 유지한다.

## 5. 테스트와 검증

### 단위/동작 테스트

- 수정: `tests/customerBridge.test.ts`
- 추가: `tests/personSelectMultiReviewer.test.ts`
- 추가: `tests/personSelectReviewerRoutes.test.ts`

### 시나리오

1. 검토자 A/B의 draft와 제출이 서로 분리된다.
2. 별점과 컬러가 공존하며 셀렉 수는 한 번만 센다.
3. 같은 컬러 키는 토글되고 0은 별점·컬러를 모두 지운다.
4. 메시지 작성자는 토큰의 검토자와 일치하고 타 프로젝트 접근은 거부된다.
5. 기존 shared token은 `기존 공동 셀렉` 결과를 계속 연다.
6. 개인별 PIN/classic 경로는 변경되지 않는다.
7. NAS 링크가 없으면 버튼이 없고, `https` 링크만 저장된다.

### 실행

- 관련 Vitest
- `npx tsc --noEmit`
- 변경 파일 ESLint
- 가능한 경우 `npm run build`
- Playwright로 고객 Bridge 1440px/390px, 관리자 검토자 설정과 두 세션 대화 확인

## 커밋 경계

1. migration + 도메인 helper/tests
2. 검토자 공개/관리자 API
3. Customer Bridge 컬러·대화·다운로드 UI
4. 관리자 검토자 관리/결과 UI
5. 검증 수정과 최종 회귀
