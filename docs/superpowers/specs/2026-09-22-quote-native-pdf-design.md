# 견적서 Native PDF 렌더링 설계

작성일: 2026-09-22

## 목표

견적서 PDF 생성 시 브라우저 DOM을 `html2canvas`로 캡처해 단일 PNG로 넣는 경로를 제거한다. 현재 화면의 canonical 문서인 `QuoteDocument`를 전용 print route에서 렌더링하고 Chromium의 `page.pdf()`로 출력해, 화면과 PDF가 같은 CSS·폰트·데이터 매핑을 사용하며 PDF 텍스트 선택과 추출이 가능하게 한다.

## 범위

- 견적서 PDF와 견적서 PNG 렌더링만 변경한다.
- 계약서와 기타 문서의 기존 html2canvas 경로는 변경하지 않는다.
- `buildQuoteHtml.ts`는 견적서 canonical renderer에서 제외하되, 참조가 완전히 사라졌는지 확인한 뒤 삭제 여부를 결정한다.
- 견적 데이터 구조, 승인·공유·워크플로 아카이브 동작은 유지한다.

## 구조

### 1. 공용 데이터 변환기

`quoteDocumentDataFromRow()`와 그 보조 변환을 `lib/quote/quoteDocumentData.ts`로 이동한다.

- `QuoteBuilder`의 현재 편집 상태는 기존과 같이 직접 `QuoteDocumentData`를 구성한다.
- 저장된 DB row를 표시하는 모바일 미리보기와 print route는 같은 `quoteDocumentDataFromRow()`를 사용한다.
- `QuoteDocumentData`와 `QuoteDocumentLine` 타입도 순수 모듈에서 제공해 server/client 양쪽에서 데이터 계산을 복제하지 않는다.

### 2. 내부 전용 print route

`app/quote-print/[id]/page.tsx`는 Supabase의 `quotes` row를 읽고 변환기를 거쳐 `QuoteDocument`를 렌더한다.

- 편집기, 헤더, 버튼, OS shell을 포함하지 않는다.
- 브랜드에 맞는 `quote-app` 클래스를 적용한다.
- wrapper에 `data-quote-print-ready="true"` marker를 둔다.
- 전용 CSS module/global print rule로 A4 landscape, 0 margin, 1123×794 문서 크기, shadow/transform 제거를 적용한다.
- 일반 브라우저 요청은 견적 ID만으로 열리지 않는다. Playwright가 보내는 내부 인증 헤더를 검증한 요청만 렌더한다.
- 인증 토큰은 서버 환경의 비밀값을 이용한 HMAC으로 만들며 원문 비밀값은 URL·HTML·로그에 노출하지 않는다.

### 3. canonical Playwright renderer

`renderQuoteBuffer()`는 더 이상 `buildQuoteHtml()`과 `page.setContent()`를 사용하지 않는다.

1. quote row의 `id`를 검증한다.
2. `${baseUrl}/quote-print/${id}?print=1`을 연다.
3. 내부 인증 헤더를 전달한다.
4. `networkidle`, ready marker, `document.fonts.ready`, 모든 이미지의 `complete`를 기다린다.
5. PDF는 `page.pdf({ format: "A4", landscape: true, printBackground: true, margin: 0, preferCSSPageSize: true })`로 생성한다.
6. PNG 요청은 같은 print page의 `.quote-page`를 캡처한다.
7. 실패 시 브라우저를 반드시 닫고, 호출자가 원인을 확인할 수 있는 오류를 전달한다.

## 소비 경로 통일

### Desktop

`QuoteBuilder.downloadPdf()`는 저장 완료 후 `POST /api/quotes/[id]/render`에 `{ format: "pdf" }`를 요청한다. 반환된 signed URL의 PDF를 다운로드하고, 기존 workflow artifact 업로드가 필요하면 같은 서버 생성 PDF blob을 재사용한다.

제거 대상:

- `cloneNode()` PDF 캡처
- 임시 `captureRoot`
- `html2canvas` 동적 import
- `canvas.toDataURL()`
- `jsPDF.addImage()`
- PDF 전용 로고 픽셀 반전 helper

### Mobile

모바일 견적 다운로드는 이미 render API를 사용하므로 유지한다. 변경된 `renderQuoteBuffer()`를 자동으로 공유한다.

### Publish

`publish_quote`의 아카이브는 기존 `renderQuoteBuffer()` 호출을 유지한다. 이 함수가 print route 기반으로 바뀌면서 Desktop/Mobile/publish가 모두 동일한 결과물을 사용한다.

## CSS 정책

- print route는 기존 `app/globals.css`의 견적서 스타일을 그대로 사용한다.
- `@page`, `html/body`, print wrapper에만 출력 전용 레이아웃 규칙을 추가한다.
- `.payment-row > span { margin-top: -2px }` 등 raster PDF 때문에 도입된 보정은 브라우저 미리보기와 native PDF를 비교한 뒤 화면에도 필요하지 않은 경우에만 제거한다.
- client strip, table header, category row, payment row, rail contact의 실제 flex/grid 중앙 정렬을 기준으로 한다.

## 오류 및 보안

- print route가 인증되지 않으면 문서 내용을 렌더하지 않고 404 처리한다.
- quote가 없거나 ID가 없으면 명시적으로 실패한다.
- 폰트 또는 이미지 로딩이 완료되지 않으면 PDF 생성으로 넘어가지 않는다.
- render API의 signed URL, 저장 버킷, 승인·공유 로직은 유지한다.

## 테스트와 검증

### 자동 테스트

- row 변환기가 기존 데이터와 동일한 `QuoteDocumentData`를 만드는지 검증한다.
- print 인증 토큰의 정상·오류 동작을 검증한다.
- renderer가 canonical print URL, 내부 헤더, ready/font/image waits, A4 landscape PDF 옵션을 사용하는지 검증한다.
- `QuoteBuilder` 소스에 PDF용 `html2canvas`, `jsPDF`, `cloneNode`, `addImage` 경로가 남지 않았는지 회귀 검증한다.
- 기존 quote, publish, mobile 관련 테스트를 유지한다.

### 실제 PDF 검증

- 저장된 실제 견적 row로 PDF를 생성한다.
- `pdftotext`에서 병원명, 견적번호, 항목명, 금액이 추출되는지 확인한다.
- `pdfimages -list`에서 페이지 전체 크기의 단일 raster image가 없는지 확인한다.
- `pdftoppm`으로 PNG를 렌더한 뒤 다음 영역을 확대해 시각 확인한다.
  - client strip의 아이콘·라벨·값
  - table header
  - category rows
  - payment rows
  - rail contact
- `npm run typecheck`, `npm test`, `npm run build`를 실행한다.

## 완료 조건

- Desktop/Mobile/publish 견적 PDF가 `renderQuoteBuffer()` 하나를 사용한다.
- PDF 본문은 native text이고 로고·서명 같은 실제 asset만 image object로 남는다.
- canonical 화면과 실제 출력 PDF의 데이터·스타일이 일치한다.
- 지정된 수직 정렬 영역을 실제 렌더 PNG로 확인한다.
