# 계약서 서버 PDF 생성 설계

## 목표와 범위

계약서 편집 UI, 저장 데이터, 3페이지 문서 디자인은 변경하지 않는다. `ContractBuilder`의 `html2canvas` + `jsPDF.addImage()` 캡처 방식만 제거하고, 저장된 계약 데이터를 서버 Chromium으로 렌더링한 실제 A4 PDF를 다운로드한다.

## 선택한 구조

1. `GET /api/contracts/[id]/pdf`가 계약서를 조회한다.
2. `normalizeContractQuoteData()`로 DB 행과 `quote_data`를 합친다.
3. 현재 canonical 문서인 `buildContractHtml()`로 같은 3페이지 HTML을 만든다.
4. 견적서 PDF와 같은 `playwright-core` + `@sparticuz/chromium` 실행 규칙으로 HTML을 렌더링한다.
5. 폰트와 이미지 로딩을 기다린 뒤 `page.pdf()`로 A4 PDF를 생성해 `application/pdf`로 직접 반환한다.
6. `ContractBuilder`는 먼저 `handleSave()` 완료를 기다리고 PDF API를 호출한다. 받은 하나의 blob을 workflow artifact 업로드와 브라우저 다운로드에 함께 사용한다.

## 변경 경계

- `buildContractHtml()`에 선택적 `baseUrl` 인자를 추가한다. 클라이언트 미리보기는 기존 `window.location.origin`을 그대로 사용하고 서버는 요청 origin을 전달한다.
- 서버 Chromium 실행은 견적서 구현과 동일한 서버리스/로컬 분기를 재사용한다. 공통화가 안전하면 작은 공용 helper를 사용하고, 문서 레이아웃 로직은 합치지 않는다.
- 계약서에 한해서 `createContractPdf()`, `html2canvas`, `jsPDF.addImage()` 사용을 제거한다. 패키지는 다른 기능에서 사용할 수 있으므로 제거하지 않는다.
- 계약서 편집 패널, 계약 조항 override, DB 스키마 및 POST/PATCH 저장 범위는 이번 작업에서 변경하지 않는다.

## 오류 처리

- 계약서가 없거나 `quote_data`가 유효하지 않으면 JSON 오류와 적절한 HTTP 상태를 반환한다.
- Chromium 실행, 로고·폰트 로딩 또는 PDF 생성이 실패하면 브라우저 다운로드와 artifact 업로드를 모두 중단하고 기존 계약서 오류 영역에 원인을 표시한다.
- workflow artifact 업로드 실패는 현재 정책대로 로컬 다운로드를 막지 않되 콘솔에 기록한다.

## 검증

- 계약서 저장이 끝난 뒤에만 PDF API가 호출되는지 확인한다.
- API 응답이 `application/pdf`이며 파일명이 계약서 규칙을 따르는지 확인한다.
- PDF가 정확히 A4 3페이지이고 텍스트 선택이 가능한지 확인한다.
- 같은 blob이 workflow artifact와 다운로드에 사용되는지 테스트한다.
- 기존 미리보기, 저장, 자동저장, 서명, Excel 다운로드, 공개·완료 흐름이 유지되는지 확인한다.
- `npm run typecheck`, `npm test`, `npm run build`를 실행한다.
