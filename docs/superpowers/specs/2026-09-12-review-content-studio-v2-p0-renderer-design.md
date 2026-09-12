# Review Content Studio V2 — P0 Canonical Renderer 설계

## 범위

Review Content Studio V2 전체 작업 중 첫 단계인 WYSIWYG 안정화만 다룬다. Editor Preview, 저장용 PNG, 다운로드 PNG, PDF가 하나의 `ReviewCanvasRenderer`를 사용하도록 정리한다. 멀티페이지 UI, Context Toolbar 개편, AI 배경 생성은 다음 단계에서 이 기반 위에 추가한다.

## 현재 구조와 실제 원인

현재 구현에는 세 가지 렌더링 경로가 존재한다.

1. `lib/reviewContent/renderVariant.ts`는 서버에서 SVG를 새로 조립하고 Sharp로 PNG를 만든다.
2. `components/reviews/ReviewStoryCanvas.tsx`는 React DOM으로 Editor Preview를 그린다.
3. Editor Export는 화면 크기에 맞춰 축소된 DOM을 html2canvas 배율로 다시 확대한다.

초기 생성 PNG와 Editor는 이미지 배치와 텍스트 줄바꿈 로직이 서로 다르다. Editor DOM 자체도 1080×1350이 아니라 fit scale이 적용된 실제 픽셀 크기로 만들어지므로, 브라우저가 작은 글자·폭의 서브픽셀 값을 기준으로 줄바꿈과 object-fit을 계산한 뒤 Export에서 확대한다. 이미지 준비도 `complete`만 확인하며 `decode()` 완료를 보장하지 않는다.

따라서 문제의 원인은 개별 spacing 값이 아니라 서로 다른 Renderer와 축소 상태에서의 layout 계산이다.

## 결정한 접근

공용 React Renderer와 편집용 축소 Wrapper, 숨김 Export Host를 사용한다.

```text
ReviewStoryDocument
        │
        ▼
ReviewCanvasRenderer (항상 1080×1350)
        ├─ Editor Preview: 바깥 Wrapper만 transform: scale(...)
        ├─ 저장/PNG: Export Host에서 동일 Renderer 캡처
        └─ PDF: 동일 PNG snapshot을 4:5 PDF 페이지에 삽입
```

Canvas 2D 전면 재작성은 텍스트 편집과 기존 DOM 기능을 크게 다시 만들어야 하므로 사용하지 않는다. 기존처럼 축소 DOM을 확대 캡처하는 최소 수정도 Canonical Canvas 원칙을 만족하지 못하므로 사용하지 않는다.

## 컴포넌트 경계

### ReviewCanvasRenderer

- 배경, 도형, 이미지, 텍스트의 출력 markup을 소유하는 유일한 Renderer다.
- DOM 크기는 항상 문서의 논리 크기인 1080×1350이다.
- `ReviewStoryDocument`와 해석된 asset URL만 입력으로 받는다.
- 선택 상태, 드래그, resize handle, toolbar 같은 Editor chrome을 포함하지 않는다.
- 모든 요소는 저장된 논리 좌표를 px 단위로 그대로 사용한다.

### Canvas 레이어

- `CanvasImageLayer`는 이미지 frame, object-fit, object-position, scale, rotation, opacity, edge blend를 한 곳에서 해석한다.
- `CanvasTextLayer`는 저장된 text box width/height와 typography 값을 그대로 적용한다.
- `CanvasShapeLayer`는 fill, radius, geometry를 적용한다.
- 필요할 경우 파일을 나누되 출력 markup은 반드시 `ReviewCanvasRenderer`를 통해서만 조합한다.

### ReviewStoryCanvas

- Editor viewport와 fit scale을 계산한다.
- Canonical Renderer를 감싸는 별도 transform Wrapper에만 scale을 적용한다.
- 선택 테두리, 핸들, 회전, smart guide, inline edit, crop control을 담당한다.
- 편집 UI가 Renderer 출력 geometry를 바꾸지 않도록 overlay 계층으로 유지한다.

### ReviewCanvasExportHost

- 화면 밖에 Canonical Renderer를 원본 크기로 렌더링한다.
- Editor와 같은 `ReviewStoryDocument`와 asset URL을 받는다.
- PNG, 저장용 미리보기, PDF가 동일한 capture 함수를 호출하게 한다.
- Export 완료 후 임시 Host와 object URL을 정리한다.

## 데이터 호환성

- 기존 `ReviewStoryDocument version: 1`을 유지한다.
- 기존 `generation_metadata.editorDocument` 저장 위치를 유지한다.
- 기존 문서 데이터는 변환 없이 그대로 열고 저장한다.
- 운영 DB의 기존 `review_content_variants.image_storage_path NOT NULL` 제약은 유지한다. 문서 우선 생성 시 유효한 pending sentinel 경로를 저장하고, Canonical PNG가 저장되기 전에는 asset 서명과 승인을 차단한다.
- 별도의 Export layout state를 만들지 않는다.
- Editor zoom은 문서에 저장하지 않고 viewport 표현에만 사용한다.

### 이미지 Source of Truth

기존 이미지 필드를 유지한다.

```ts
type ReviewStoryImageElement = {
  x: number;
  y: number;
  width: number;
  height: number;
  cropX: number;
  cropY: number;
  scale: number;
  rotation: number;
  opacity: number;
};
```

Editor와 Export는 `CanvasImageLayer`에서 같은 값과 같은 CSS를 사용한다. Preview와 Export에 서로 다른 crop 계산식을 두지 않는다.

### 텍스트 Source of Truth

기존 `x`, `y`, `width`, `height`, `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `letterSpacing`, `textAlign`, `color`를 Canonical px 값으로 해석한다. Export 시 text box width나 글자 크기를 다시 계산하지 않는다.

## 초기 생성 흐름

`generate-variants`가 Editor와 다른 SVG/Sharp 디자인을 최종 PNG처럼 생성하는 경로를 제거한다.

1. 서버는 기존 템플릿과 리뷰 데이터로 `ReviewStoryDocument`를 생성한다.
2. variant/page 레코드와 `generation_metadata.editorDocument`를 먼저 저장한다. 기존 DB 제약과 호환되도록 `image_storage_path`에는 아직 실제 파일이 아닌 pending sentinel 경로를 기록한다.
3. 클라이언트는 공용 Renderer로 문서를 렌더링한다.
4. 같은 capture 함수로 미리보기 PNG를 만들어 기존 review asset storage에 저장한다.
5. 썸네일 생성이 실패해도 `editorDocument`는 남으며 저장 재시도로 복구할 수 있다.

별도 운영 DB 마이그레이션은 필요하지 않다. 조회 API와 서명 함수는 pending 경로를 실제 asset으로 취급하지 않는다. Page Strip은 PNG가 아직 없으면 `editorDocument` 기반 라이브 썸네일을 표시하며, 저장된 Canonical PNG 경로와 `canonicalRenderedAt`이 모두 있어야 새 Renderer 시안을 승인할 수 있다. 기존 데이터와 API의 나머지 형태는 유지한다. 초기 SVG/Sharp는 편집·저장·내보내기의 Source of Truth로 사용하지 않는다.

## Resource Ready

모든 캡처는 `waitForCanvasResources(root)`를 거친다.

1. `await document.fonts.ready`
2. Renderer 내부 모든 `HTMLImageElement` 수집
3. 로드 완료 확인
4. 각 이미지의 `decode()` 완료 확인
5. 실패한 자산이 있으면 캡처 중단 및 식별 가능한 오류 반환

불완전한 이미지가 있는 상태에서 PNG/PDF를 생성하지 않는다. Export 대상 이미지는 기존 controlled storage의 signed URL 또는 same-origin URL만 사용한다.

## PNG 흐름

```text
active ReviewStoryDocument
→ ReviewCanvasExportHost
→ waitForCanvasResources
→ Canonical Renderer capture
→ dimension 검사
→ Blob
→ 다운로드 또는 기존 review-content-assets 업로드
```

- 기본 PNG: 1080×1350
- 고화질 PNG: 같은 layout을 capture scale 2로 출력하여 2160×2700
- 고화질에서도 좌표, text width, crop 값은 변경하지 않는다.

## PDF 흐름

PDF는 별도 HTML 또는 text layout을 만들지 않는다.

```text
Canonical Renderer
→ PNG snapshot
→ jsPDF custom 4:5 page
→ snapshot 전체 면적 삽입
```

첫 단계에서는 현재 활성 페이지의 PDF를 안정화한다. 다음 멀티페이지 단계에서는 같은 capture 함수를 page 순서대로 반복해 PDF 페이지를 추가한다.

## 오류 처리

- 폰트 또는 이미지 준비 실패 시 Export를 중단하고 사용자에게 원인을 표시한다.
- capture 결과의 width/height가 요청 크기와 다르면 파일 저장을 중단한다.
- 초기 미리보기 업로드 실패는 문서 생성 성공과 분리해 재시도 가능하게 한다.
- 기존 저장 API 실패 메시지와 busy 상태 처리를 유지한다.

## 테스트

### 단위 및 구조 테스트

- 문서는 계속 1080×1350으로 생성된다.
- Canonical Renderer의 root 크기는 zoom과 무관하게 1080×1350이다.
- 이미지 layer는 Editor와 Export에서 동일한 crop CSS를 사용한다.
- 텍스트 layer는 저장된 width와 typography를 그대로 사용한다.
- resource-ready 함수는 fonts와 image decode 완료 전 resolve하지 않는다.
- 기본 캡처는 정확히 1080×1350이다.
- 2배 캡처는 정확히 2160×2700이다.
- PDF helper는 동일 PNG snapshot을 사용하고 텍스트를 다시 조판하지 않는다.

### 브라우저 회귀 테스트

실제 Review Studio에서 다음 조합을 검증한다.

- 얼굴이 중앙에 오도록 이동·확대한 인물 사진
- 여러 줄로 줄바꿈되는 긴 한글 후기
- 하단 병원명과 URL
- 느린 이미지 로드 상태
- 50%, 맞춤, 100% 등 Editor zoom 변경

Editor Preview와 기본 PNG를 비교해 얼굴 위치, 줄바꿈, clipping, spacing이 동일한지 확인한다. 고화질 PNG는 같은 구성을 정확히 2배 크기로 유지해야 한다.

## 완료 기준

- Editor Preview와 PNG는 다른 layout renderer를 사용하지 않는다.
- PDF는 별도로 텍스트를 reflow하지 않는다.
- 사진 crop은 Editor와 Export에서 같은 Renderer 로직을 사용한다.
- 저장 PNG와 다운로드 PNG가 같은 capture 함수를 사용한다.
- 기존 리뷰, 템플릿, `editorDocument`, 저장된 PNG 경로가 데이터 변환 없이 유지된다.
- 타입 검사, 관련 단위 테스트, 프로덕션 빌드, 브라우저 회귀 검증이 통과한다.

## 후속 단계

1. 기존 variant 레코드를 페이지로 확장하고 Cover/Page/Design 추가 UI를 구현한다.
2. 선택 레이어 기반 Context Toolbar와 단순화된 오른쪽 패널을 구현한다.
3. Provider adapter, controlled storage, 배경 layer를 포함한 AI Background 기능을 구현한다.
