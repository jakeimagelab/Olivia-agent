# Review Content Studio V2 — Visible Workspace 설계

## 목적

P0 canonical renderer 위에 사용자가 실제로 체감하는 Content Design Studio 작업 흐름을 얹는다. 기존 `review_contents`, `review_content_variants`, `review_layout_assets`를 유지하고, 새 페이지 종류와 배경 자산은 variant의 `generation_metadata` 안에서 하위 호환되게 확장한다.

## 화면 구조

- 상단: 저장, 대표 승인/게시, 템플릿 저장, PNG/PDF 내보내기
- 왼쪽: 리뷰 원문, 병원/의사, 사진, 템플릿
- 중앙 상단: 선택 레이어에 따라 바뀌는 Context Toolbar
- 중앙: canonical 1080×1350 Canvas를 visual scale로 표시
- 중앙 하단: 리뷰/커버/자유 페이지 thumbnail과 `커버 추가`, `페이지 추가`, `디자인 추가`
- 오른쪽: `요소 설정`과 `레이어` 두 탭만 제공

## Context Toolbar

- 텍스트: 글꼴, 크기, 색상, 굵게/기울임/밑줄, 정렬, 행간, 자간, 하이라이트, 삭제
- 이미지: 교체, 자르기, 채우기/맞추기, 위치 초기화, 삭제
- 장식: 색상, 삭제
- 무선택: 텍스트/이미지 추가, 배경색, AI 배경, 템플릿

정밀 x/y/width/height, 회전, 불투명도, crop 수치는 오른쪽 요소 설정에 남긴다.

## 페이지 저장

DB 스키마를 갈아엎지 않는다. variant 한 행을 한 페이지로 계속 사용하며 metadata에 다음을 추가한다.

```ts
{
  pageType: "review" | "cover" | "free";
  pageName: string;
  designPreset?: string;
  editorDocument: ReviewStoryDocument;
}
```

기존 variant는 `review / 리뷰 페이지`로 자동 해석한다. 커버는 현재 병원명과 날짜, 선택 사진만 재사용하며 후기 본문은 복사하지 않는다.

## 배경 자산

`ReviewStoryDocument.backgroundImage`에 asset id, Olivia storage path, fit, position, scale, opacity를 저장한다. Renderer가 이 상태를 Editor, PNG, PDF에 공통 적용한다.

AI 호출은 `/api/review-content/background/generate`에서만 수행한다. `BackgroundGenerator` adapter가 provider를 감싸고, 결과 이미지는 즉시 `review-content-assets/generated/...`에 복사한다. 캔버스는 provider URL을 직접 사용하지 않는다. 실제 문구는 계속 editable text layer로 유지한다.

## Export

페이지마다 같은 `ReviewCanvasRenderer` export host를 만들고 순서대로 snapshot한다. PNG는 현재 페이지, PDF는 모든 페이지 snapshot을 4:5 custom page에 그대로 삽입한다. PDF 전용 텍스트 레이아웃은 없다.

## 오류 처리

- 콘텐츠가 없으면 페이지 추가 비활성화
- AI API/스토리지 오류는 캔버스 상태를 바꾸지 않고 메시지 표시
- 마지막 페이지 삭제 금지, 다른 페이지 삭제는 기존 확인 유지
- 새 기능을 모르는 기존 문서는 기존 렌더 결과를 유지

## 검증

- TypeScript, production build, 전체 Vitest
- 1440px 실제 작업창에서 3-column/toolbar/page strip 확인
- 텍스트 선택 시 BAR와 정밀 속성 동시 반영 확인
- 커버/페이지/디자인/AI modal 접근성 snapshot 확인
- 기존 P0 font/image ready와 1080/2160 export 테스트 유지
