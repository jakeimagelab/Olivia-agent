# 리뷰 스토리 자동 생성기 통합 리디자인 설계

## 목표

기존 `/review-studio`의 후기 수집, AI 콘텐츠 생성, 레이아웃 에셋, 이미지 시안, 고객·워크플로우 연결, 대표 승인, Instagram 게시 기능을 유지하면서 하나의 편집 작업실 UI로 통합한다. 사용자는 후기와 고객 정보, 사진, 템플릿을 선택해 여러 페이지를 만들고 각 페이지를 편집·저장·PNG 내보내기 할 수 있다.

새로운 리뷰 기능을 병렬로 만들지 않는다. 기존 `client_reviews`, `review_contents`, `review_content_variants`, `review_layout_assets`가 계속 Source of Truth다.

## 현재 구조와 재사용 범위

- Route: `app/(client-hub)/review-studio/page.tsx`
- 후기 원본: `client_reviews`
- 콘텐츠 문서: `review_contents`
- 생성 시안: `review_content_variants`
- 템플릿: `review_layout_assets.layout_config`
- 이미지 저장소: 기존 `review-content-assets` Supabase bucket과 signed upload/download 흐름
- AI 문구 생성: `app/api/reviews/generate/route.ts`
- 시안 생성: `app/api/review-contents/[contentId]/generate-variants/route.ts`
- 이미지 렌더링: `lib/reviewContent/renderVariant.ts`의 SVG + Sharp 경로
- 기존 자동화: `lib/reviewContent/createOliviaCampaign.ts`
- 기존 승인·게시: review content 승인 API와 Instagram publish API

이 기능들은 새 UI에서 재배치하고 필요한 편집 메타데이터만 additive하게 확장한다.

## 데이터 모델

기존 `review_content_variants`의 각 행을 한 개의 Story Page로 취급한다. 별도 StoryDocument/StoryPage 테이블을 만들지 않는다.

문서 단위 정보는 기존 `review_contents`가 담당한다.

- `review_contents.id`: 편집 문서 ID
- `review_contents.review_id`, `client_id`, `workflow_run_id`: 기존 연결 유지
- `summary`, `caption`, `hashtags`, `carousel`: 기존 AI 생성 결과 유지
- `selected_variant_id`, `status`: 승인·게시 흐름 유지

페이지 단위 정보는 기존 `review_content_variants`가 담당한다.

- `layout_asset_id`: 적용 템플릿
- `image_storage_path`: 렌더된 PNG
- `sort_order`: 페이지 순서
- `width`, `height`: 기존 1080×1350 유지
- `generation_metadata.editorDocument`: 편집 가능한 logical-coordinate 문서

`editorDocument`는 버전, 배경, 요소 배열을 가진다. 요소는 text/image/shape 타입과 공통 좌표 `x`, `y`, `width`, `height`, `rotation`, `opacity`, `zIndex`, `locked`, `hidden`을 사용한다. 텍스트는 content와 typography를, 이미지는 기존 asset 경로와 crop·edgeBlend 정보를 가진다.

과거 variant에 `editorDocument`가 없으면 기존 layout config, 리뷰 문구, 병원명, 생성 이미지에서 기본 편집 문서를 파생한다. 원본 행을 읽지 못하게 만드는 파괴적 migration은 하지 않는다.

## UI 구조

`/review-studio` 기본 화면을 “리뷰 스토리 자동 생성기”로 교체한다. 기존 Admin/Client Hub shell은 유지한다.

- Header: 제목, 통합 badge, 저장, 템플릿 저장, PNG 내보내기
- Left 300~330px: 후기 불러오기·입력, 병원/원장/날짜, 사진, 기존 템플릿, 생성 개수와 자동 생성
- Center: warm-gray stage 위 1080×1350 scaled editor, undo/redo, zoom/fit
- Right 300~320px: 선택된 text/image 속성, 블렌딩, 레이어
- Bottom: 기존 variant 목록을 사용하는 생성된 스토리 strip

기존 후기 등록과 워크플로우 접수 후기는 왼쪽 소스 선택 흐름에 통합한다. 기존 승인과 Instagram 게시는 저장된 Story Pages 아래 문서 액션으로 유지한다.

## 편집 엔진

새 Canvas dependency는 추가하지 않는다. logical coordinate 1080×1350을 기준으로 DOM/SVG 기반 편집 레이어를 구현한다.

- Pointer drag: 좌표 이동, 종료 시 history 저장
- Corner handles: 크기 조절, 이미지 비율 잠금 지원
- Text: double click 또는 속성 패널에서 직접 수정
- Image: 업로드 asset으로 교체, crop offset/scale 조절, 초기화
- Layer: 선택, visibility, lock, 앞/뒤 이동, 삭제
- Keyboard: Delete, Arrow, Shift+Arrow, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+D
- History: 문서별 최대 50 snapshot, drag 중간 프레임은 저장하지 않고 종료 시 한 번 저장

지원하지 않는 Canva급 자유 도형·필터·협업 기능은 만들지 않는다.

## 경계 블렌딩

이미지 요소에 다음 정보를 저장한다.

- enabled
- type: blur 또는 gradient
- directions: top/bottom/left/right 복수 선택
- size
- strength

Preview는 CSS mask와 필요한 최소 overlay/filter를 사용한다. Gradient는 alpha mask로 처리한다. Blur는 이미지 전체가 아니라 선택한 경계 범위에만 적용되는 edge layer를 사용한다. 슬라이더 변경은 즉시 preview에 반영하되 history는 interaction commit 시점에 기록한다.

서버 PNG renderer에도 같은 logical 값과 mask 정의를 전달해 preview와 export 차이를 최소화한다.

## 생성 및 저장 흐름

1. 기존 후기 또는 수동 입력을 선택한다.
2. 고객·워크플로우 연결값을 유지한다.
3. 사진을 기존 review asset bucket에 업로드한다.
4. 기존 `review_layout_assets` 중 4:5 템플릿을 선택한다.
5. 기존 AI `/api/reviews/generate` 결과의 carousel/summary를 페이지 문구로 사용한다.
6. 선택 템플릿을 순환하며 기존 variant 행을 Story Page로 생성한다.
7. 각 페이지의 `generation_metadata.editorDocument`와 렌더 PNG를 함께 갱신한다.
8. 저장 후 다시 GET 했을 때 같은 페이지와 편집 상태를 복원한다.

AI가 실패하거나 키가 없어도 기존 fallback 콘텐츠와 문단 분배로 페이지 생성이 가능해야 한다. AI는 템플릿 좌표·폰트·브랜드 색상을 변경하지 않는다.

## 템플릿 저장

현재 페이지를 템플릿으로 저장할 때 기존 `review_layout_assets`에 `asset_type=builtin` 또는 현재 규칙에 맞는 사용자 템플릿으로 저장한다. 실제 후기, 병원명, 원장명, 날짜, 사진은 binding으로 치환하고 좌표·스타일·레이어·블렌딩만 `layout_config`에 저장한다.

새 템플릿 테이블을 만들지 않는다.

## Export

MVP 내보내기는 현재 실제 지원 경로인 PNG만 제공한다. 기존 SVG + Sharp renderer를 편집 문서를 받을 수 있도록 확장하고, 결과는 기존 bucket에 저장한 뒤 1080×1350 PNG로 다운로드한다. JPG/PDF/ZIP 버튼은 실제 지원이 추가되기 전까지 노출하지 않는다.

## 오류 처리

- 후기·고객·템플릿·이미지 로드 실패는 해당 패널에서 재시도 가능하게 표시한다.
- 저장 실패 시 dirty state를 유지하고 성공 메시지를 표시하지 않는다.
- 렌더 실패 시 기존 저장된 variant 이미지는 보존한다.
- 이미지 업로드가 일부 실패하면 성공한 asset과 실패 파일을 구분한다.
- 기존 콘텐츠가 editorDocument로 변환되지 않아도 원본 PNG preview와 승인·게시 기능은 계속 사용할 수 있다.

## Olivia Context와 Chat 준비

Workspace mount 시 `activeWorkspace`/현재 문서와 다음 최소 Context를 등록한다.

- pageMode
- currentDocumentId/type/title
- selectedRowId 또는 선택 page/element pointer
- capabilities: review load/edit/generate/export
- canEdit

생성 로직은 UI 컴포넌트 안에 복제하지 않고 review content service/renderer에 둔다. 기존 Chat의 `generate_review_content`는 같은 `review_contents`와 `review_content_variants`를 계속 사용하고 `/review-studio`를 연다.

## 테스트와 완료 조건

- 기존 리뷰 목록과 workflow review 로드
- 기존 콘텐츠와 variant 이미지 로드
- 신규 후기 저장 및 고객 연결 유지
- 템플릿 선택과 여러 page 생성
- page 전환·순서 변경·복제·삭제
- text/image 이동·크기 변경·편집
- crop 및 gradient/blur edge 설정
- layer visibility/lock/reorder
- undo/redo 및 keyboard 이동
- 저장 후 재로드 복원
- 1080×1350 PNG 렌더·다운로드
- 기존 승인·Instagram 게시 흐름 회귀
- 기존 `/review-studio` bookmark 유지
- Olivia Chat/Content Studio/Admin shell 회귀
- `npm run typecheck`, `npm test`, `npm run build`, 가능하면 `npm run lint`
