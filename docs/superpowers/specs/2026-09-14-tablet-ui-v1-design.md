# Olivia OS Tablet UI 1차 개편 설계

## 범위

이번 변경은 Tablet Surface의 홈, 콘티, 문서함 세 화면만 대상으로 한다. 기존 API, DB, 비즈니스 로직, 상태관리, Navigation, TabletDock, Desktop UI, Mobile UI는 유지한다. 모든 스타일 변경은 Tablet 전용 data attribute 또는 CSS module scope 안에서만 적용한다.

## 공통 Header

기존 `TabletTopBar` 하나를 공통 Header로 유지한다. 배경은 `#155855`, 브랜드와 페이지 제목은 흰색, 보조 정보는 투명도 있는 흰색으로 표현한다. 로고 asset과 날짜/뒤로가기 동작은 기존 구현을 재사용한다.

## Tablet Home

기존 API 기반 대시보드와 관련 fetch/effect를 제거하고, `TABLET_APPS`를 source of truth로 사용하는 iPad 스타일 App Grid를 렌더링한다. `home` 앱은 그리드에서 제외한다. Wallpaper는 정적인 Green/Ivory radial gradient를 사용하며 카드 배경 없이 아이콘과 앱 이름을 직접 배치한다. 가로 화면은 6열, 세로 화면은 4~5열의 반응형 grid를 사용하고 기존 `onNavigate`를 그대로 호출한다. `TabletDock`은 수정하지 않는다.

## Tablet Conti

`ContiV2App`의 기존 생성/편집/저장/불러오기/Preview 동작을 유지한다. `surface?: "default" | "tablet"` optional prop과 `data-conti-surface` root attribute를 추가하고 Tablet 호출부에서만 `surface="tablet"`을 전달한다. Tablet scope에서만 55:45 two-column layout, 16~20px padding, 18~20px radius, compact field spacing을 적용한다. Hero의 내용은 유지하되 이전 콘티/불러오기/Camera action은 Hero 아래 Utility Bar로 배치한다. Preview는 기존 Dark Green 스타일을 유지하며 Tablet 공간에 맞게만 정돈한다.

## Tablet Documents

`DocumentsWindowContent`에 optional `surface?: "desktop" | "tablet"`를 추가하고 Tablet에서만 `surface="tablet"`을 전달한다. 기존 검색, 카테고리, 상태 variant/label, 문서 route와 데이터를 변경하지 않는다. Tablet scope에서 Sidebar는 약 180~200px, 카드 padding 12~14px, radius 14~16px, 최소한의 shadow를 사용한다.

문서 종류 표시용 `DocumentTypeIcon`을 새로 만들고 `DocumentsGrid`에서 사용한다. AppIcon/Dock 아이콘은 사용하지 않는다. Quote는 green, Contract는 coral, Storyboard는 purple, General/Temp는 blue, Memo는 amber, Gallery는 teal, Other는 neutral tile family를 사용한다. 이는 실행 버튼이 아니라 문서 타입을 구분하는 시각 요소다.

## Typography

Tablet 홈·콘티·문서함 UI는 기존 `var(--font-sans)`(Pretendard Variable)를 사용한다. 위계는 다음으로 통일한다.

- 대분류: `font-weight: 650`
- 중분류: `font-weight: 450`
- 설명: `font-weight: 300`

기존 기능상 필요한 버튼/상태/문서 제목의 굵기는 가독성을 위해 유지하되, Tablet scope에서만 위계 토큰을 적용한다. 리뷰 캔버스의 사용자 지정 결과물 폰트는 변경하지 않는다.

## 검증

Tablet preview에서 홈 App Grid와 Dock navigation을 확인한다. 콘티의 생성/이전 콘티/불러오기/Camera/Preview가 기존 동작을 유지하는지 확인한다. 문서함의 검색·필터·문서 클릭과 타입 아이콘 표시를 확인한다. Desktop 및 Mobile 화면에 스타일 변화가 없는지 확인하고 `npm run typecheck`, `npm run build`를 실행한다.
