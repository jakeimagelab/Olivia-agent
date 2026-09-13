# Olivia Tablet UI Unification V2 Design

## Goal

Olivia Tablet Shell V1의 기능 연결은 유지하면서, 홈과 모든 Tablet 앱을 사진작업실에서 확립한 시각 언어로 통일한다. Desktop과 Mobile은 변경하지 않으며 Tablet은 기존 기능보다 더 많은 기능을 갖지 않는다.

## Success criteria

- iPad Pro 12.9/13 landscape와 portrait의 Tablet 홈이 스크롤 없이 한 화면에 들어온다.
- Dock 활성 상태는 배경 강조 없이 오렌지 점 하나로만 표시된다.
- Tablet 공통 Header는 Olivia deep green surface를 사용한다.
- 모든 Tablet 앱은 공통 Hero, Action Bar, Work Surface 구조를 사용한다.
- 고객관리, 일정, 문서함, 채팅, 리뷰콘텐츠, 메모, 견적·계약, 채널분석, 브랜드이미지, 콘티가 Tablet 안에서 전체 화면으로 열린다.
- 홈과 Dock에서 콘티를 열 때 `/conti`로 이탈하지 않고 같은 Tablet Conti 화면을 연다.
- 기존 API, DB, 저장·수정·생성 로직과 canonical state를 재사용한다.
- Desktop/Mobile 동작과 스타일은 회귀하지 않는다.

## Chosen approach

Tablet 전용 Presentation Layer를 만들고 기존 기능 로직과 데이터를 재사용한다.

- 단순 CSS 스킨은 Desktop 구조가 남기 때문에 사용하지 않는다.
- 기능별 로직을 복제한 새로운 Tablet 앱도 만들지 않는다.
- Tablet 전용 frame, layout, compact navigation, master-detail composition을 만들고 기존 컴포넌트와 service를 연결한다.
- 기존 컴포넌트를 직접 재사용할 때는 Tablet surface wrapper가 헤더, 여백, 스크롤, touch target을 통제한다.
- 기존 전체 Route만 존재하는 기능은 Tablet 전용 bridge를 통해 같은 기능을 보여주되 이중 헤더와 Desktop chrome을 제거한다.

## Visual system

### Common shell

- Header: deep green (`#155855` 계열), 흰색 identity/title, 낮은 대비의 상태 metadata.
- Content background: warm ivory.
- Work surface: white, 20~24px radius, Olivia green hairline, 과하지 않은 ambient shadow.
- Primary action: 한 화면에 하나만 orange.
- Secondary action: white/mint neutral.
- Minimum touch target: 44px.
- Tablet app content는 top bar와 floating dock 사이에서만 스크롤한다.

### Photo Workspace visual grammar

모든 앱은 사진작업실의 다음 구조를 공유한다.

1. App identity / status Hero
2. Primary actions 또는 compact summary
3. White work surface
4. Master/detail 또는 main/secondary layout

앱마다 필요한 정보 구조는 다르지만 색, radius, typography, spacing, action hierarchy는 동일하다.

## Home

- Home root는 `overflow: hidden`이며 가용 높이를 CSS grid로 나눈다.
- Hero는 가로형에서 약 24~28%, portrait에서 약 20~24% 높이를 사용한다.
- 일정, 할 일, 최근 문서, 최근 콘티는 2×2 compact grid에 배치한다.
- 각 목록은 고정된 최대 행만 표시하고 나머지는 해당 앱의 전체 화면에서 확인한다.
- 별도 하단 채팅 strip은 제거하거나 Hero action에 통합해 세로 공간을 절약한다.
- 오류 상태도 전체 높이를 밀어내지 않는 compact inline state로 표시한다.

## Dock

- 활성 앱의 mint background와 tile 강조를 제거한다.
- 아이콘 아래 4~5px orange indicator만 표시한다.
- `conti`를 정식 `TabletAppId`와 Dock 앱 목록에 추가한다.
- 13개 앱이 1024px 폭에서도 Dock 내부 가로 스크롤 없이 들어오도록 label, gap, tile size를 compact preset으로 조정한다.
- 기존 Desktop registry icon을 우선 재사용한다.

## Tablet navigation and Conti

- `TabletAppId`에 `conti`를 추가한다.
- Tablet navigation query에 `tabletApp`, `resourceId`, 필요한 경우 `clientId`, `workflowRunId`를 보존한다.
- 홈 `콘티 열기`는 `onNavigate("conti")`를 사용한다.
- 최근 콘티 선택은 `resourceId`를 Tablet navigation context로 전달한다.
- Tablet Conti는 `ContiWorkspaceAdapter`/`ContiV2App`을 직접 재사용한다.
- 생성, Table 편집, Field View는 동일 canonical state를 사용한다.
- `/conti` route로 전체 페이지 이동하지 않는다.

## App-specific compositions

### Clients

- Landscape: list 34%, detail 66%.
- Portrait: list와 detail을 단계적으로 전환한다.
- 기존 client APIs와 workspace state를 사용한다.

### Calendar

- Month/week calendar가 main surface를 차지한다.
- 오늘 일정과 할 일은 compact secondary rail 또는 drawer로 배치한다.
- 기존 click/edit workflow를 유지한다.

### Documents

- Category/list/detail master-detail 구조를 사용한다.
- 기존 document search와 preview 기능을 유지한다.

### Olivia Chat

- 대화 목록과 현재 대화를 넓은 Tablet split으로 구성한다.
- canonical conversation store와 단일 chat portal을 유지한다.

### Review Studio

- Canvas를 중심에 두고 content controls와 contextual controls를 side/bottom drawer로 배치한다.
- 기존 renderer와 export path를 변경하지 않는다.

### Memo

- folder/list/editor master-detail 구성을 사용한다.
- 기존 memo CRUD를 재사용한다.

### Quote and Contract

- 상단 segment는 유지하되 Tablet Hero 아래 compact action bar로 통합한다.
- 기존 editor와 preview state를 재사용한다.

### Channel Analysis and Brand Image

- 새 분석 기능을 만들지 않는다.
- 기존 route와 service를 same-origin Tablet frame에 연결한다.
- `oliviaEmbedded=1`에서 route 자체의 navigation/header를 숨기고 Tablet typography, spacing, surface token을 적용한다.
- 기존 페이지 로직을 복제하거나 이번 범위에서 대규모 page component 분리를 하지 않는다.

### Voice

- disabled 상태와 준비 중 안내를 유지한다.

### Photo Workspace

- 현재 Tablet Remote Controller UI를 visual reference로 유지한다.
- Remote API와 실제 실행은 구현하지 않는다.

## State and data flow

- Tablet navigation만 Tablet shell에서 소유한다.
- 고객, 일정, 문서, 채팅, 리뷰, 메모, 견적, 계약, 콘티 상태는 기존 store/component/service가 소유한다.
- Tablet wrapper는 데이터의 두 번째 source of truth를 만들지 않는다.
- 앱 전환 시 URL history를 갱신하고 back/forward로 active app과 selected resource를 복원한다.

## Error handling

- 앱 데이터 실패는 해당 work surface 안에서 compact retry state로 보여준다.
- 하나의 widget 실패가 Home 전체를 막지 않는다.
- route bridge 실패는 Tablet header와 Dock을 유지한 채 오류를 보여준다.
- 실제 실행하지 않은 기능을 완료로 표시하지 않는다.

## Performance

- 무거운 앱은 현재처럼 dynamic import로 앱 선택 시 로드한다.
- Home 독립 요청은 병렬로 실행한다.
- 대형 Desktop route를 Tablet home bundle에 정적으로 포함하지 않는다.
- scrolling container에 큰 blur를 사용하지 않는다.

## Testing

- Surface unit test: mobile/tablet/desktop 및 preview priority.
- Tablet navigation test: conti resource query round trip.
- Dock test: active background 제거, orange indicator, conti registry icon.
- Browser QA: 1366×1024와 1024×1366 Home no-scroll.
- Browser QA: 모든 Dock 앱 전환, Home→Conti, recent Conti→selected resource.
- Browser QA: Desktop 1366 fine pointer와 Mobile 390×844 regression.
- TypeScript, targeted ESLint, full Vitest, production build.

## Out of scope

- API 또는 DB schema 변경
- Tablet 전용 duplicated business logic
- 새로운 분석, CRM, Review, Quote, Conti 기능
- Mac Studio remote executor
- AI Voice 구현
- Desktop/Mobile redesign
