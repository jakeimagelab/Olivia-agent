# 앱 전체 리퀴드 글래스 리디자인

- 작성일: 2026-08-13
- 대상 저장소: Olivia-agent (photoclinic-quote-admin)
- 배경: 올리비아 채팅 UI 일부(입력창/드로어/컨텍스트독)에 리퀴드 글래스를 시범 적용했으나 "안 보이는 수준"이라는 피드백을 받음. 사용자가 참고 이미지(아이폰/맥OS 스타일 — 두껍고 빛나는 유리 카드가 떠 있는 느낌, 그린/오렌지 브랜드 컬러는 유지)를 제시하며 앱 전체("모든 영역")를 이 스타일로 리디자인해달라고 요청.

## 0. 조사 결과 (재조사 불필요)

- `app/globals.css`(8728줄)에 이미 `--liquid-*` 토큰 체계와 `pc-liquid-hero` 같은 네이밍이 존재함 — 즉 리퀴드 글래스는 이미 한 번 시도됐던 방향이지만 값이 너무 얌전함:
  - `--liquid-bg: rgba(240,244,242,.76)`, `--liquid-panel: rgba(255,255,255,.64)`, `--liquid-panel-strong: rgba(255,255,255,.82)`, `--liquid-border: rgba(255,255,255,.72)`, `--liquid-shadow: 0 4px 24px rgba(21,88,85,.07), 0 1px 0 rgba(255,255,255,.86) inset`, `--liquid-shadow-strong: 0 14px 40px rgba(21,88,85,.13), 0 1px 0 rgba(255,255,255,.94) inset` (7~22줄)
  - 소비처: `.pc-card`(7151), `.pc-liquid-hero`(7103), `.pc-section`(7295), `.ops-table-card`/`.ops-panel`/`.report-preview`(1112) — 전부 `--liquid-panel-strong`/`--liquid-border`/`--liquid-shadow`를 그대로 씀. **카드와 표가 지금 같은 토큰을 공유**하고 있어서, 토큰 값만 강하게 올리면 표까지 같이 강해짐 — 분리 필요.
- `.pc-btn--primary`/`.pc-btn--orange`(7203, 7210, `globals.css`)는 불투명 솔리드 배경 — 참고 이미지의 CTA 버튼(불투명 파랑 + 광택)과 같은 역할이라 **투명 유리로 바꾸지 않고 광택 하이라이트만 추가**. `.pc-btn--secondary`/`.pc-btn--ghost`(7216, 7227)는 이미 반투명이라 소프트 유리 톤으로 자연스럽게 흡수됨.
- `.oa-sidebar`(`app/admin/admin.css:30`)는 `background: rgba(255,255,255,.97)`, blur 없음 — 유리 처리가 전혀 안 되어 있어 새로 추가해야 함.
- `.oa-header`(`app/admin/admin.css:559`)는 `blur(18px)`는 있지만 배경/그림자가 얕음 — 강화 대상.
- `admin.css`의 `.olivia-conversation__stage` 계열(Phase 5에서 이미 작업)은 별도 `--glass-*` 토큰(`--glass-highlight`/`--glass-edge`/`--glass-blur-deep` 등, `admin.css:1843~`)을 쓰고 있음 — 이번 작업에서 같은 강도로 맞추되, 전역 `--liquid-*` 토큰과 이름이 겹치지 않게 유지(두 체계를 억지로 통합하지 않음, 범위 밖).
- `app/globals.css`와 `app/admin/admin.css`는 둘 다 루트 레이아웃(`app/layout.tsx:8-9`)에서 임포트되므로 **앱 전체(모든 라우트)에 전역 적용**됨 — 파일 위치와 무관하게 클래스명만 맞으면 어디서든 반영됨.
- **버그 재발 방지**: Phase 5에서 `background: <이미지> padding-box, <색상> padding-box, <이미지> border-box;` 처럼 다중 레이어 중간에 순수 색상을 넣어서 CSS가 통째로 무효화된 적이 있음(브라우저가 조용히 무시, 스크린샷만으론 못 알아챔). 이번에도 다중 레이어 배경을 쓸 때는 색상을 반드시 `linear-gradient(색상, 같은색상)`으로 감싸서 이미지 레이어로 취급되게 하고, **배포 후 `getComputedStyle().backgroundImage`가 실제로 값을 갖는지 확인**하는 걸 검증 절차에 명시적으로 포함한다.

## 1. 토큰 재설계

`app/globals.css`의 `--liquid-*` 토큰을 두 등급으로 분리한다(기존 이름 재사용, 값과 역할만 재정의):

```css
:root {
  /* 소프트 유리 — 표/리스트/조밀한 데이터 영역. 가독성 우선, 지금보다 아주 살짝만 강화 */
  --liquid-bg: rgba(240, 244, 242, .8);
  --liquid-panel: rgba(255, 255, 255, .86);
  --liquid-shadow: 0 6px 22px rgba(21, 88, 85, .07), 0 1px 0 rgba(255, 255, 255, .8) inset;

  /* 강한 유리 — 사이드바/헤더/카드/모달/히어로. 두께감·굴절 엣지·앰비언트 그림자 */
  --liquid-panel-strong: rgba(255, 255, 255, .46);
  --liquid-border: rgba(255, 255, 255, .85);
  --liquid-highlight: linear-gradient(135deg, rgba(255,255,255,.95) 0%, rgba(255,255,255,.25) 38%, rgba(255,255,255,0) 62%);
  --liquid-edge: linear-gradient(160deg, rgba(255,255,255,1) 0%, rgba(255,255,255,.15) 45%, rgba(21,88,85,.3) 100%);
  --liquid-shadow-strong:
    0 26px 64px -14px rgba(21, 88, 85, .32),
    0 4px 14px rgba(21, 88, 85, .14),
    inset 0 1px 1px rgba(255,255,255,.95),
    inset 0 -1px 1px rgba(21,88,85,.08);
  --liquid-blur-strong: 44px;
}
```

`--liquid-panel-strong`의 의미가 "옅은 흰색"에서 "블러가 더 많이 비치는 낮은 채움"으로 바뀌는 게 핵심이다 — 지금은 거의 불투명(.82)이라 블러 효과가 안 보였는데, 채움을 낮추고(.46) 대신 `--liquid-highlight`/`--liquid-edge` 레이어로 형태를 잡아준다. **Phase 5 버그 재발 방지를 위해 색상은 전부 `linear-gradient(색, 색)`으로 감싸서 이미지 레이어로 취급**한다.

## 2. 컴포넌트별 적용

**강한 유리 (`--liquid-panel-strong` 계열 사용)**
- `.pc-card`, `.pc-card--padded`, `.pc-liquid-hero`, `.pc-section` (`globals.css`) — `background: var(--liquid-highlight) padding-box, linear-gradient(var(--liquid-panel-strong), var(--liquid-panel-strong)) padding-box, var(--liquid-edge) border-box`, `border: 1px solid transparent`, `backdrop-filter: blur(var(--liquid-blur-strong)) saturate(1.6)`, `box-shadow: var(--liquid-shadow-strong)`
- `.oa-sidebar`, `.oa-header` (`admin.css`) — 같은 강한 유리 레이어를 새로 추가(사이드바는 지금 완전 불투명이라 신규, 헤더는 기존 blur 18px→44px로 강화)
- 모달/다이얼로그 공용 클래스(발견되는 대로) — 강한 유리

**소프트 유리 (`--liquid-panel` 계열, 표/리스트)**
- `.ops-table-card`, `.ops-panel`, `.report-preview` (`globals.css:1112`) — 지금처럼 `--liquid-panel-strong`을 참조하던 것을 **`--liquid-panel`(소프트)로 전환**해서 카드와 분리. blur는 16px 수준으로 낮게 유지.

**버튼 — 불투명 유지 + 광택만 추가**
- `.pc-btn--primary`, `.pc-btn--orange` (`globals.css:7203, 7210`) — `background`는 그대로 솔리드 그린/오렌지 유지. 위에 `background-image: linear-gradient(135deg, rgba(255,255,255,.35), rgba(255,255,255,0) 55%)`로 광택 오버레이 한 겹, `box-shadow`에 살짝 입체적인 하이라이트 인셋 추가.
- `.pc-btn--secondary`, `.pc-btn--ghost` — 기존에도 반투명이라 소프트 유리 톤(`--liquid-panel` 참조)으로 자연스럽게 흡수.

**Olivia 채팅 유리 (Phase 5, `admin.css`)**
- `.olivia-composer`, `.olivia-chat-drawer`, `.olivia-context-dock`, `.olivia-message-guide__popover` — 기존 `--glass-*` 토큰 값을 이번 강한 유리 등급과 시각적으로 맞춤(블러/하이라이트/엣지 강도를 동일 수준으로), 토큰 이름 자체는 유지(전역 통합은 범위 밖).

## 3. 예외 처리 — 인라인 스타일 컴포넌트

`components/workspace/DynamicWorkspace.tsx`의 헤더/바디가 공유 클래스 대신 인라인 `style={{...}}`을 직접 씀 — 발견 시 `.pc-card` 상당의 강한 유리 인라인 스타일로 개별 수정. 작업 중 비슷하게 인라인 스타일로 카드/패널을 그리는 곳이 더 나오면 같은 방식으로 처리(전수조사는 안 하고, 눈에 띄는 대로 처리 — 전수조사는 범위가 너무 커짐).

## 4. 배포 · 성능 리스크

- 이 세션 내내 파일 저장마다 자동 커밋·배포가 걸렸음 — 이번엔 `globals.css`/`admin.css` 두 파일에 작업을 최대한 몰아서 편집 횟수(=배포 큐)를 줄인다.
- `backdrop-filter: blur(44px)`를 카드 여러 개가 동시에 화면에 뜨는 페이지(대시보드 등)에 걸면 느려질 수 있음 — 배포 후 실제 브라우저로 체감 속도 확인, 느리면 강한 유리 등급의 blur를 낮추거나(예: 32px) 겹치는 블러 레이어 수를 줄인다.
- 기존 `--oa-*`/`--command-*` 등 다른 토큰 체계는 건드리지 않는다(전체 토큰 통합은 범위 밖).

## 5. 검증 계획

- `npx tsc --noEmit`, `npx vitest run`, `npm run build` 통과.
- 배포 후 프로덕션에서 `getComputedStyle(el).backgroundImage`로 다중 레이어 배경이 실제로 적용됐는지 최우선 확인(Phase 5에서 겪은 무효 CSS 버그 재발 방지).
- Playwright로 사이드바, 헤더, 대시보드 카드, 표(고객 목록 등), 버튼(주요/보조) 스크린샷 확보 후 육안 비교.
- 데이터 밀집 화면(고객 목록, 캘린더 표)에서 텍스트 가독성 저하 여부 확인.
