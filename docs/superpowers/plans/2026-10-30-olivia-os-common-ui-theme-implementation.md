# OliviaOS 공통 UI 테마 구현 계획

## 1. 토큰과 공통 프리미티브

- `app/globals.css`: 확정된 `--ui-*` 토큰을 `:root`에 추가하고 기존 핵심 토큰을 호환 별칭으로 연결한다.
- `components/ui/Button.tsx`: primary, secondary, disabled의 의미를 새 토큰과 600 이하 굵기에 맞춘다.
- `components/ui/ActionBar.tsx`: 표면, 테두리, 상태 글자를 토큰에 연결한다.
- 공통 input/select/textarea 포커스와 팝업 표면을 토큰으로 정리하되 전역 svg 색상은 건드리지 않는다.

## 2. OS 셸과 로고

- `components/olivia-os/OliviaDesktop.module.css`: 헤더·작업 영역·채팅 레일·Dock 표면을 공통 토큰에 연결한다.
- `components/olivia-os/window/AppWindow.module.css`: 창 바탕·헤더·테두리·그림자를 공통 토큰에 맞춘다.
- 기존 `/assets/photoclinic-logo.png`, `/assets/photoclinic-mark.png` 사용처는 그대로 두고 filter·mask를 추가하지 않는다.
- Desktop/Window/Dock 구조와 동작은 변경하지 않는다.

## 3. 콘티 우선 적용

- `components/conti/v2/ContiV2.module.css`: 앱 바탕, 편집 작업 영역, 입력·표·팝업, primary/secondary 버튼을 토큰에 연결한다.
- `ContiCreateScreen.tsx`와 `ContiEditorWorkspace.tsx`의 로직과 DOM 순서는 보존한다.
- 인쇄·공유 문서 컴포넌트는 수정하지 않는다.

## 4. 견적·일정·고객관리

- `app/globals.css`의 quote 편집 셸과 preview shell 주변만 테마화하고 견적서 종이·print route는 제외한다.
- `components/calendar/CalendarWorkspace.tsx`의 화면 색 상수를 공통 토큰 값에 맞추고 일정 종류 색상은 보존한다.
- `app/globals.css`의 `.pcrm-*` 조작 화면에 페이지·카드·입력·팝업 토큰을 적용하고 상태 의미색은 보존한다.

## 5. 올리비아 채팅

- `app/globals.css`의 `.olivia-conversation*` 스타일을 웜화이트/그레이그린/밝은 표면 계층으로 정리한다.
- 사용자 말풍선은 그레이그린, AI 메시지는 밝은 표면으로 유지한다.
- 전송·새 대화·채팅 실행 아이콘에만 오렌지를 적용한다.
- 스트리밍, 스크롤, 포털, 현재 작업 연결 코드는 수정하지 않는다.

## 6. 공통 작업실 경계

- 밝은 작업실 셸은 토큰에 연결하되 사진·영상 판단용 다크 패널은 그대로 둔다.
- 브릿지 이미지 영역과 미리보기 object-fit/비율은 수정하지 않는다.
- 문서·사진·영상 콘텐츠에는 테마 선택자를 적용하지 않는다.

## 7. 검증

- `npm run typecheck`
- `npm run lint`
- 관련 `npm test`
- `npm run build`
- Playwright로 콘티, 견적서, 일정, 고객관리, 채팅을 넓은 화면과 좁은 창에서 캡처한다.
- 로고 원본 색상·비율, 버튼 상태, 포커스, 팝업, 문서/PDF 경계를 수동 점검한다.
