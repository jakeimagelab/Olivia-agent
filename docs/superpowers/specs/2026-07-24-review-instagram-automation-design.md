# 올리비아 리뷰 콘텐츠·인스타그램 승인 게시 설계

## 1. 목표

리뷰 등록 경로를 하나로 통합하고, 올리비아가 공개 활용 가능한 리뷰를 선별해
인스타그램 이미지 시안을 생성하도록 한다. 외부 게시만 대표자 승인을 거친다.

최종 흐름:

`리뷰 등록 → 고객·워크플로 연결 → 올리비아 선별 → 콘텐츠 생성 → 레이아웃 시안 3개 → 대표 승인 → 포토클리닉 인스타그램 게시`

## 2. 현재 구조와 문제

- 리뷰 콘텐츠 화면과 수동 입력 API는 `delivery_reviews`를 사용한다.
- 올리비아챗과 고객 포털, 고객 워크플로는 `client_reviews`를 사용한다.
- 같은 리뷰 기능이 두 테이블로 나뉘어 등록 위치에 따라 다른 화면에 보이지 않는다.
- 수동 리뷰 저장은 고객 ID와 워크플로 실행 ID를 연결하지 않는다.
- 현재 리뷰 콘텐츠 생성은 문구와 캡션만 반환하며 생성 결과를 독립 콘텐츠로 관리하지 않는다.
- 인스타그램 디자인 화면에는 5개 클라이언트 캔버스 템플릿이 있으나 서버 자동 생성,
  레퍼런스 레이아웃 등록, 게시 API 연결은 없다.
- 카카오 AI 비서 화면은 공통 폰트 토큰 대신 비정규 합성 굵기와 인라인 스타일을 사용한다.

## 3. 확정한 자동화 수준

- 올리비아는 리뷰 선별과 이미지 시안 생성까지 자동으로 수행한다.
- 대표자는 시안과 캡션을 확인하고 승인·수정 요청·취소할 수 있다.
- `instagram.publish`는 대표자 전용이며 승인 없이 실행하지 않는다.
- 게시 실패는 자동 재시도하되 중복 게시하지 않는다.

## 4. 리뷰 기준 데이터 통합

`client_reviews`를 신규 기능의 기준 테이블로 사용한다.

수동 입력, 고객 포털, 올리비아챗 모두 동일한 리뷰 생성 서비스를 호출한다.
기존 `delivery_reviews`는 즉시 삭제하지 않고 호환 읽기와 일회성 백필에만 사용한다.

`client_reviews`에 additive 컬럼을 추가한다.

- `workflow_run_id uuid nullable`
- `source text not null default 'manual'`
- `source_channel text`
- `delivered_at date`
- `content_status text not null default 'unused'`
- `legacy_delivery_review_id uuid nullable`
- `updated_at timestamptz`

`content_status`:

- `unused`
- `candidate`
- `drafted`
- `approved`
- `published`
- `excluded`

기존 `delivery_reviews`는 병원명이 정확히 한 고객과 일치하는 행만 `client_reviews`로
멱등 백필한다. 일치하지 않거나 중복 고객인 행은 원본을 보존하고 관리자 연결 대기 목록에 표시한다.

## 5. 리뷰 등록 공통 서비스

`lib/reviews/createReview.ts`에 공통 생성 함수를 둔다.

처리 순서:

1. 고객 ID 또는 병원명으로 고객을 정확히 확인한다.
2. 최근 활성 워크플로 실행을 확인한다.
3. `client_reviews`에 리뷰를 저장한다.
4. 리뷰 요약·콘텐츠 변환·위험 점검 agent task를 생성한다.
5. 워크플로 이벤트와 Olivia 이벤트를 기록한다.
6. 리뷰 콘텐츠 화면에 즉시 표시한다.

고객을 찾지 못하면 임의로 신규 고객을 만들지 않는다. 수동 화면에서는 기존 고객 선택을
필수로 하고, 올리비아챗은 후보 고객을 제시해 사용자가 선택하도록 한다.

## 6. 올리비아 리뷰 선별

올리비아는 아래 기본 조건을 모두 만족하는 리뷰만 자동 후보로 선택한다.

- `allow_public_use = true`
- 공개 문구 또는 만족 포인트가 존재
- 기본 만족도 4점 이상
- 이미 게시되거나 제외되지 않음
- 개인정보, 민감한 진료정보, 과장된 효과 표현이 없음

후보 점수:

- 구체적인 촬영 경험
- 결과물 활용 사례
- 병원의 분위기와 신뢰를 설명하는 문장
- 사진·영상 촬영 과정에 관한 서술
- 기존 게시물과의 중복도
- 최신성

낮은 만족도, 개선 요청, 개인정보 포함 리뷰는 자동 제외하지 않고 대표 확인 목록으로 보낸다.

Olivia Action:

- `review.find_candidates`
- `review.select_for_content`
- `review_content.generate`
- `review_content.regenerate`
- `review_content.request_revision`
- `instagram.publish`

`instagram.publish`만 항상 OWNER 승인 필요로 지정한다.

## 7. 콘텐츠 및 레이아웃 데이터

신규 additive 테이블:

### `review_contents`

- 리뷰, 고객, 워크플로 연결
- 요약, 캡션, 해시태그, 카드 문구
- 위험 점검 결과
- 상태: `draft`, `variants_ready`, `waiting_approval`, `approved`, `published`, `failed`
- 선택 레이아웃과 선택 시안
- 생성자와 승인자

### `review_layout_assets`

- 레이아웃 이름과 설명
- 비율: `1:1`, `4:5`, `9:16`
- 유형: `builtin`, `reference`
- 레퍼런스 원본 저장 경로와 썸네일
- 색상·여백·사진 영역·텍스트 영역·정렬을 담는 `layout_config jsonb`
- 활성 상태

### `review_content_variants`

- 콘텐츠와 레이아웃 연결
- 생성 이미지 저장 경로
- 생성 설정과 버전
- 정렬 순서
- 선택 여부

### `instagram_publish_jobs`

- 콘텐츠, 이미지, 캡션
- 상태: `waiting_approval`, `publishing`, `published`, `failed`, `canceled`
- 멱등 키
- Meta creation ID와 media ID
- 오류, 재시도 횟수, 게시 시간

모든 테이블은 RLS를 적용하고 서버의 인증된 관리자 경로에서만 변경한다.

## 8. 레퍼런스 디자인을 레이아웃 에셋으로 등록

1. JPG 또는 PNG 레퍼런스를 Supabase Storage 비공개 버킷에 업로드한다.
2. Vision 분석으로 사진 영역, 텍스트 영역, 여백, 정렬, 색상 비율을 구조화한다.
3. 분석 결과를 `layout_config` 초안으로 만든다.
4. 관리자가 미리보기에서 영역을 수정한 후 레이아웃 에셋으로 저장한다.
5. 원본 이미지를 그대로 복제하지 않고 구조와 배치만 재사용한다.

한글 텍스트 정확도를 위해 이미지 생성 모델에 글자를 직접 그리게 하지 않는다.
배경 또는 보조 이미지는 AI 생성이 가능하지만, 제목·본문·브랜드 표시는 결정적 렌더러로 합성한다.
서버 렌더러는 SVG 레이아웃을 만들고 `sharp`로 Instagram용 PNG/JPEG를 생성한다.

초기 기본 레이아웃:

- 사진 상단 + 리뷰 하단
- 전체 사진 + 그라디언트
- 리뷰 텍스트 카드
- 사진 프레임
- 포인트 바

## 9. 이미지 시안 생성

올리비아가 콘텐츠 하나마다 서로 다른 레이아웃 시안 3개를 만든다.

- 4:5 피드 이미지를 기본으로 한다.
- 고객의 승인된 사진이 있으면 최신 사진 갤러리에서 후보를 제시한다.
- 사진이 없으면 리뷰 텍스트 카드 또는 포토클리닉 브랜드 배경을 사용한다.
- 이미지마다 사용한 리뷰, 사진, 레이아웃, 문구 버전을 기록한다.
- 대표자는 시안 선택, 문구 수정, 다른 레이아웃 생성, 이미지 교체를 할 수 있다.

## 10. 인스타그램 게시

Meta의 공식 Instagram Content Publishing 흐름을 사용한다.

1. Professional Instagram 계정을 연결한다.
2. 공개 접근 가능한 만료 URL로 승인 이미지를 제공한다.
3. media container를 생성한다.
4. container 상태를 확인한다.
5. 대표 승인 토큰과 멱등 키를 다시 확인한다.
6. `/media_publish`로 게시한다.
7. media ID와 게시 시간을 저장한다.

공식 API는 Professional 계정의 콘텐츠 게시를 지원하고, 게시 시 media container를 먼저
만든 뒤 `media_publish`에 `creation_id`를 전달한다.

참고:

- [Meta Instagram API 공식 컬렉션](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Meta media_publish 요청](https://www.postman.com/meta/instagram/request/23987686-299b176b-90aa-4d8a-b6cf-e6028fc69de5)

토큰은 클라이언트에 노출하지 않는다. 단일 포토클리닉 계정 연결 정보는 서버에서 암호화해 저장하고,
토큰 만료와 권한 상태를 설정 화면에서 확인한다.

## 11. UI

### 카카오 AI 비서

- `var(--font-sans)`와 기존 관리자 카드 규격 적용
- 400/700 굵기만 사용
- 연결 상태, 브리핑, 테스트, 실행 기록을 동일한 Olivia 카드 위계로 정리

### 리뷰 콘텐츠

- `리뷰함 / 콘텐츠 제작 / 레이아웃 에셋 / 게시 대기` 네 영역
- 리뷰 출처와 고객·워크플로 연결 상태 표시
- 올리비아 추천 이유와 제외 위험 표시
- 시안 3개 비교, 선택, 수정 요청
- 승인 후 게시 버튼

### 올리비아챗

- “공개 가능한 리뷰를 골라 인스타 시안 만들어줘” 명령 지원
- 후보 리뷰와 선정 이유 표시
- 생성 시안은 이미지 첨부 카드로 표시
- 게시 요청은 승인 카드로 표시

## 12. API

- `GET/POST /api/reviews`
- `GET /api/reviews/candidates`
- `POST /api/review-contents`
- `GET/PATCH /api/review-contents/[contentId]`
- `POST /api/review-contents/[contentId]/generate-variants`
- `POST /api/review-contents/[contentId]/approve`
- `POST /api/review-contents/[contentId]/request-revision`
- `GET/POST /api/review-layout-assets`
- `POST /api/review-layout-assets/upload-session`
- `POST /api/review-layout-assets/[assetId]/analyze`
- `GET /api/instagram/status`
- `GET /api/instagram/connect`
- `GET /api/instagram/callback`
- `POST /api/instagram/publish`

## 13. 보안과 중복 방지

- 인스타 게시 API는 OWNER만 호출 가능
- 콘텐츠 승인 시 현재 상태를 서버에서 다시 확인
- 게시 작업에 고유 멱등 키 적용
- 동일 콘텐츠의 중복 `media_publish` 차단
- 레퍼런스 및 생성 이미지는 허용 MIME과 크기 검증
- 공개 활용 동의가 철회되면 미게시 콘텐츠와 예약 작업을 차단
- 토큰, Meta 응답 원문, 개인정보를 일반 로그에 남기지 않음

## 14. 구현 순서

1. 카카오 AI 비서 폰트와 UI 정리
2. 리뷰 DB 공통 서비스와 호환 백필
3. 수동 리뷰·올리비아챗·고객 포털을 공통 서비스에 연결
4. 고객 워크플로 이벤트 연결
5. 리뷰 후보 선별과 위험 점검
6. 콘텐츠 및 레이아웃 에셋 DB/API
7. 레퍼런스 업로드와 구조 분석
8. 결정적 이미지 렌더러와 시안 3개 생성
9. 올리비아 Action과 채팅 이미지 카드
10. 인스타그램 연결, 승인, 게시
11. Realtime 또는 재검증 기반 상태 동기화
12. 테스트, 타입 검사, 빌드

## 15. 테스트

- 수동 리뷰가 `client_reviews`와 워크플로에 동시에 표시
- 올리비아챗 리뷰가 리뷰 콘텐츠에 즉시 표시
- 고객 포털 리뷰가 중복 저장되지 않음
- 공개 활용 미동의 리뷰가 자동 선별되지 않음
- 개인정보·저평점 리뷰가 자동 게시 후보에서 제외
- 레퍼런스 레이아웃 등록과 시안 3개 생성
- 승인 전 게시 차단
- OWNER 외 게시 차단
- 동일 승인 연속 클릭 시 한 번만 게시
- Meta API 실패 시 실패 상태와 안전한 재시도
- 게시 성공 시 media ID 및 리뷰 콘텐츠 상태 반영

## 16. 외부 설정

- Meta Business 앱
- 포토클리닉 Professional Instagram 계정
- Instagram Content Publishing 권한
- OAuth callback URL
- 토큰 암호화 키
- Meta Graph API 버전

구체적인 환경변수 이름과 Meta 설정 절차는 구현 결과에 맞춰 별도 운영 문서로 제공한다.
