# Olivia 네이티브 창 통일 설계

작성일: 2026-09-26

## 목표

매일 사용하는 사진·납품·업무 화면을 Olivia OS의 네이티브 `AppWindow` 안에서 직접 렌더해, iframe에서 끊기던 고객·워크플로 컨텍스트와 데스크탑 단축키를 복구한다. 독립 URL과 기존 API·Store·Navigation은 유지하며, 사용 빈도가 낮은 나머지 화면은 호환 iframe으로 남기되 제약을 명확히 표시한다.

## 현재 코드 기준

- `/select-match`, `/raw-select`, `/photo-retouching`은 이미 `getCanonicalWorkspaceHref()`를 통해 `/photo-sorting?tool=...`로 정규화되고 `PhotoWorkspaceWindowContent`를 사용한다.
- 사진 워크플로 중 실제 레거시 iframe 진입점은 `/select-galleries` 목록과 `/select-galleries/[id]` 상세다.
- 레지스트리에 없는 라우트는 `useDesktopAppLauncher()`에서 `legacy-route`로 내려가 `LegacyRouteWindowContent`의 iframe으로 열린다.
- iframe 헤더는 `html.olivia-embedded`와 전역 CSS로 숨기지만, 네이티브 화면은 `hideHeader` 또는 `surface="window"` 같은 명시적 prop을 사용한다.

## 구현 범위

### 1. 사진 워크플로 네이티브화

#### 기존 네이티브 라우트

다음 세 라우트는 현재 canonical 사진작업실 매핑을 유지한다. 같은 기능을 위한 별도 어댑터나 두 번째 실행 경로를 만들지 않는다.

- `/select-match` → `/photo-sorting?tool=select-raw`
- `/raw-select` → `/photo-sorting?tool=ai-cull`
- `/photo-retouching` → `/photo-sorting?tool=retouch`

레지스트리 테스트로 이 세 경로가 `photo-workspace` 네이티브 앱으로 해석되는지 고정한다.

#### 셀렉 갤러리 목록과 상세

`/select-galleries`와 `/select-galleries/[id]`를 하나의 `select-galleries` 네이티브 앱으로 처리한다.

- 목록·상세 페이지의 본문을 재사용 가능한 컴포넌트로 분리한다.
- 독립 URL 페이지는 기존 layout과 URL을 그대로 유지하며 같은 본문 컴포넌트를 렌더한다.
- AppWindow 어댑터는 `WindowContext.routeHref`의 pathname과 resource ID를 보고 목록 또는 상세 본문을 선택한다.
- 레지스트리는 `/select-galleries` 정확 일치뿐 아니라 `/select-galleries/<galleryId>` 한 단계 상세 경로도 같은 앱으로 해석한다. 다른 임의 prefix route까지 포괄하는 범용 matcher는 만들지 않는다.
- `clientId`와 `workflowRunId`는 URL 의존 대신 어댑터 context에서 명시적으로 전달한다. 독립 URL에서는 기존 search params를 사용한다.
- 상세에서 목록으로 돌아가기, 보정으로 이동하기 등 내부 이동은 OS 창에서는 `useDesktopAppLauncher()`를 사용하고 독립 URL에서는 Next router를 사용한다.
- 자체 `GlobalHeader` 또는 route-group header는 네이티브 surface에서 렌더하지 않는다.
- 외부 고객에게 보내는 `/select/[shareToken]` 공개 갤러리 화면은 범위 밖이며 변경하지 않는다.

### 2. 납품·발송과 업무 화면 네이티브화

다음 라우트에 전용 WindowContent 어댑터를 추가한다.

- `/seo-delivery`
- `/mailing`
- `/work-journal`
- `/report`

각 페이지는 독립 URL을 계속 제공하고, 본문 컴포넌트가 `surface="page" | "window"` 또는 동등한 `hideHeader` prop을 받는다. window surface에서는 자체 `GlobalHeader`만 숨기며 업무 UI와 API 호출은 그대로 유지한다. `clientId`·`workflowRunId`가 필요한 화면은 어댑터 context를 우선하고 독립 URL에서는 search params를 fallback으로 사용한다.

### 3. 레거시 iframe 표시

`legacy-route` AppWindow의 제목 옆에 작은 `호환 화면` 배지를 표시한다.

- 배지는 시각적으로 제목을 방해하지 않는 중립 톤으로 둔다.
- 마우스 hover와 키보드 focus에서 `단축키와 대화 컨텍스트 연동이 제한됩니다` 툴팁을 제공한다.
- `title` 속성만 의존하지 않고 접근 가능한 설명을 제공한다.
- iframe의 로딩·실패·재시도 동작은 유지한다.

### 4. 헤더 소유권

- 네이티브 화면은 AppWindow header 하나만 보인다.
- 새 네이티브 어댑터는 `DesktopWindowProvider`와 명시적 surface/header prop을 사용한다.
- `.olivia-embedded .oa-header` 등 전역 규칙은 아직 iframe으로 남는 화면에만 필요한 호환 규칙이므로 제거하지 않는다.
- 네이티브로 전환한 화면이 전역 CSS 땜질에 의존하지 않는지 `windowHeaderEmbedding.test.ts`에 케이스를 추가한다.

### 5. 색상 토큰 정책

- 새 어댑터와 새 CSS는 `var(--deep-green)`, `var(--ink)`, `var(--line)`, `var(--danger)`, `var(--content-bg)` 등 기존 토큰만 사용한다.
- 실제로 구조를 수정하는 셀렉 갤러리 파일의 하드코딩 색은 기존 토큰으로 치환한다.
- 이미 네이티브인 대형 `PhotoSortingWorkspace`와 `SelectMatchWorkspace`는 이번 작업에서 기능 변경이 없으므로 대량 치환하지 않는다.
- Tailwind나 별도 디자인 시스템은 추가하지 않는다.

## 데이터와 컨텍스트 흐름

1. `useDesktopAppLauncher()`가 href를 레지스트리에서 해석한다.
2. `contextFromHref()`가 `clientId`, `workflowRunId`, `resourceId`를 읽고 `routeHref`와 함께 WindowContext에 저장한다.
3. 네이티브 어댑터가 WindowContext를 본문 prop으로 전달한다.
4. `useOliviaDesktopContextBridge()`가 활성 AppWindow의 client/project/resource 값을 채팅 컨텍스트 Store와 동기화한다.
5. 화면 내부에서 새로운 상세·기능 경로를 열 때 동일 launcher를 사용해 context를 유지한다.

셀렉 갤러리 앱은 목록과 상세가 동일 app ID를 쓰는 singleton 창이다. 기존 `openApp()`이 이미 열린 singleton에 새 context를 받으면 title/context를 교체하는 동작을 재사용해, 상세 진입 시 routeHref를 갱신하고 목록으로 돌아갈 때도 같은 창 안에서 본문만 전환한다.

## 오류 처리와 호환성

- 기존 API 오류·로딩 UI는 유지한다.
- 네이티브 어댑터의 동적 import에는 현재 어댑터 패턴과 같은 로딩 상태를 제공한다.
- 목록 또는 상세 route 정보가 불완전하면 목록으로 안전하게 fallback한다.
- iframe 화면의 기존 15초 timeout과 재시도는 변경하지 않는다.
- 라우트 페이지와 고객 공개 링크는 삭제하거나 redirect-only로 바꾸지 않는다.

## 테스트와 검증

### 자동 테스트

- 사진 3개 canonical 경로와 셀렉 갤러리 목록·상세가 올바른 네이티브 app ID로 해석되는지 검증한다.
- 새 납품·발송·업무 4개 라우트가 legacy fallback을 사용하지 않는지 검증한다.
- 모든 새 어댑터가 명시적 window surface/header prop을 사용하는지 검증한다.
- 셀렉 갤러리의 `clientId`, `workflowRunId`, 상세 resource ID가 WindowContext에서 본문으로 전달되는지 검증한다.
- `legacy-route`만 `호환 화면` 배지와 제한 툴팁을 받는지 검증한다.
- 기존 standalone/iframe header 동작과 독립 URL이 유지되는지 검증한다.

### 브라우저 검증

- 셀렉 갤러리 목록에서 상세로 들어가도 iframe으로 전환되지 않는지 확인한다.
- 목록·상세에서 AppWindow 헤더가 한 줄만 보이는지 확인한다.
- 고객 컨텍스트를 가진 상태에서 채팅 배너의 `지금 대상`이 같은 고객인지 확인한다.
- 창 내부에 포커스가 있어도 데스크탑 단축키가 동작하는지 확인한다.
- 최소 창 크기까지 줄였을 때 주요 컨트롤이 잘리거나 이중 스크롤되지 않는지 확인한다.
- 남은 iframe 화면의 배지·툴팁·로딩·재시도를 확인한다.

### 명령 검증

- `npm run typecheck`
- 관련 Vitest와 전체 `npm test`
- `npm run build`
- 레지스트리 route 목록과 `olivia-embedded` 규칙 수를 확인한다.
- 수정한 사진 화면의 하드코딩 색상 수가 증가하지 않았는지 확인한다.

## 완료 조건

- 사진 워크플로 네 경로의 목록·상세 포함 실사용 흐름이 네이티브 창에서 끝까지 이어진다.
- 납품·발송·업무 우선 화면 네 개가 네이티브 창으로 열린다.
- 네이티브 화면은 customer/workflow context와 데스크탑 단축키를 공유한다.
- iframe으로 남는 화면은 `호환 화면` 및 제한 안내를 명시한다.
- 독립 URL, 공개 고객 링크, 기존 API와 데이터 구조는 그대로 유지된다.
