# Olivia Agent 디자인 가이드

`app/globals.css`의 실제 CSS 변수·`.pc-*` 공통 컴포넌트 클래스와, 여러 페이지에서 실제 쓰이고 있는 패턴을 기준으로 정리했습니다. 새 화면을 만들 때는 아래 순서로 우선 검토하세요: **① `.pc-*` 공통 클래스로 가능한가 → ② 안 되면 CSS 변수(`var(--deep-green)` 등)로 직접 스타일링 → ③ 그래도 안 되면 페이지 로컬 `C` 컬러 객체(레거시 패턴, 아래 참고)**.

---

## 1. 브랜드 컬러

`app/globals.css` `:root`에 정의된 실제 변수입니다. 하드코딩된 hex보다 변수를 우선 사용하세요.

| 변수 | 값 | 용도 |
|---|---|---|
| `--deep-green` | `#155855` | 브랜드 프라이머리 (헤더 텍스트, 버튼, 활성 탭, 강조 숫자) |
| `--sage` | `#569082` | 세컨더리/그라데이션 보조색 |
| `--orange` | `#E85D2C` | 프라이머리 액션 컬러 (CTA 버튼, 포커스 상태) |
| `--orange-soft` | `#EB754C` | 오렌지 소프트 변형 |
| `--gold` | `#EB8F22` | 이런벨(eyebrow) 라벨, 포인트 강조 |
| `--ivory` | `#faf7f2` | 페이지 기본 배경(`body`) |
| `--paper` | `#ffffff` | 카드/패널 배경 |
| `--ink` | `#222222` | 기본 텍스트 |
| `--muted-green` | `#5A7470` | 보조/설명 텍스트 |
| `--soft-mint` | `#EAF4F2` | 옅은 배경 강조, teal 배지 배경 |

페이지 로컬 팔레트(아래 "레거시 패턴" 참고)에서 자주 보이는 보조 톤도 참고하세요: 힌트 텍스트 `#9BB5B0`/`#7A9E9B`, 보더 `rgba(21,88,85,.12)`, 짙은 텍스트 `#1C2B28`/`#3A5450`.

시맨틱 컬러(성공/경고/에러)는 별도 변수가 없고 상황별로 직접 씁니다: 성공 `#059669`/`#22876A`, 경고 `#D97706`, 에러 `#DC2626`.

### 리퀴드 글래스(liquid glass) 톤
헤더·탭·카드에 공통으로 쓰이는 반투명 블러 레이어입니다. 새 patch도 이 변수를 재사용하세요.

```css
--liquid-bg: rgba(240, 244, 242, .76);
--liquid-panel: rgba(255, 255, 255, .64);
--liquid-panel-strong: rgba(255, 255, 255, .82);
--liquid-border: rgba(255, 255, 255, .72);
--liquid-shadow: 0 4px 24px rgba(21, 88, 85, .07), 0 1px 0 rgba(255, 255, 255, .86) inset;
--liquid-shadow-strong: 0 14px 40px rgba(21, 88, 85, .13), 0 1px 0 rgba(255, 255, 255, .94) inset;
```
적용 시 항상 `backdrop-filter: blur(20~28px) saturate(1.4~1.8)`를 함께 씁니다.

### 페이지 배경(mesh gradient)
`.pc-header`가 있는 페이지는 아래 `--mesh-bg`가 `main`/`div` 배경에 자동 적용됩니다(별도 클래스 지정 불필요).
```css
--mesh-bg:
  radial-gradient(ellipse 130% 55% at 10% 0%,  rgba(21,88,85,.13)   0%, transparent 52%),
  radial-gradient(ellipse 90%  60% at 90% 100%, rgba(235,143,34,.09) 0%, transparent 50%),
  radial-gradient(ellipse 80%  80% at 55% 50%,  rgba(86,155,140,.06) 0%, transparent 55%),
  #f0f4f2;
```

---

## 2. 타이포그래피

**전역 기본 폰트**는 `app/layout.tsx`에서 Google Fonts로 로드하는 **Noto Sans KR**입니다 (`--font-sans` 변수, `body`에 적용). 아래 폰트들은 페이지별로 필요할 때만 추가 로드하는 **선택적 악센트 폰트**입니다 — 새 페이지에 굳이 다 넣지 말고, 전역 Noto Sans KR로 시작하세요.

| 폰트 | 용도 | 로드 위치 예시 |
|---|---|---|
| Noto Sans KR | 전역 기본 (본문/버튼/라벨 전반) | `app/layout.tsx` |
| Pretendard | 폼 입력·라벨 (색감 체크 컨택트 폼 등) | 페이지별 jsdelivr link |
| Spoqa Han Sans Neo | 대형 헤딩 (콘티 스튜디오 등 브랜드 톤 강한 화면) | 페이지별 jsdelivr `@font-face` |
| Open Sans | 이런벨(eyebrow) 라벨 텍스트 | 페이지별 Google Fonts link |
| Poppins | 숫자 강조(카운터, 스텝 번호) | 페이지별 Google Fonts link |

굵기는 본문 400~500, 강조 텍스트 700~800, 카드 타이틀/숫자 900을 주로 씁니다.

---

## 3. 레이아웃

- `.pc-page` — 페이지 최상위 래퍼, `min-height: 100vh; background: var(--mesh-bg)`
- `.pc-content` — 본문 컨테이너, `max-width: 1100px; margin: 0 auto; padding: 36px 24px 64px`
  - `.pc-content--narrow` (780px), `.pc-content--wide` (1400px) 변형 존재
- `.pc-two-col`, `.pc-card-grid` — 2단/카드 그리드 레이아웃 (`.pc-card-grid`는 모바일에서 자동 1열)
- 모바일 대응 유틸리티 클래스: `.pc-mobile-stack`(모바일에서 세로 스택), `.pc-mobile-form-grid`(모바일에서 폼 그리드 축소), `.pc-mobile-actions`

---

## 4. 공통 컴포넌트 (`.pc-*`)

### 헤더
모든 관리자 페이지 상단에 sticky로 붙는 표준 헤더입니다.
```tsx
<header className="pc-header">
  <div className="pc-header-left">
    <Link href="/" className="pc-header-back">← 관리자 홈</Link>
    <div className="pc-header-divider" />
    <div className="pc-header-brand">
      <img src="/logo.svg" className="pc-header-logo" alt="포토클리닉" />
      <span className="pc-header-title">페이지 이름</span>
    </div>
  </div>
  <div className="pc-header-actions">{/* 우측 액션 버튼들 */}</div>
</header>
```

### 탭
```tsx
<nav className="pc-tabs">
  <button className={`pc-tab ${active ? "pc-tab--active" : ""}`}>
    <Icon size={14} className="pc-tab-icon" /> 탭 이름
  </button>
</nav>
```

### 버튼 (`.pc-btn`)
베이스 `.pc-btn` + 색상 변형(`--primary`/`--orange`/`--secondary`/`--ghost`/`--danger`) + 크기 변형(`--sm`/`--lg`, 기본은 42px 높이).
```tsx
<button className="pc-btn pc-btn--primary">저장</button>
<button className="pc-btn pc-btn--orange pc-btn--lg">지금 실행</button>
<button className="pc-btn pc-btn--ghost pc-btn--sm">취소</button>
```
- `--primary`: 짙은 그린 배경 + 흰 글자 (기본 CTA)
- `--orange`: 오렌지 배경 (강조 액션)
- `--secondary`: 반투명 흰 배경 + 그린 글자 (보조 액션)
- `--ghost`: 테두리만 있는 저강조 버튼
- `--danger`: 삭제/위험 액션 (연한 빨강)

### 배지 (`.pc-badge`)
```tsx
<span className="pc-badge pc-badge--teal">진행중</span>
<span className="pc-badge pc-badge--green">완료</span>
<span className="pc-badge pc-badge--orange">대기</span>
<span className="pc-badge pc-badge--red">실패</span>
```
변형: `--green`(#D1FAE5/#065F46) `--orange`(#FEF3C7/#92400E) `--red`(#FEE2E2/#991B1B) `--blue`(#DBEAFE/#1E40AF) `--gray`(#F3F4F6/#374151) `--teal`(#EAF4F2/#155855)

### 카드
```tsx
<div className="pc-card pc-card--padded">
  <div className="pc-card-header">
    <span className="pc-card-title">카드 제목</span>
  </div>
  {/* 내용 */}
</div>
```
`.pc-card`는 반투명 리퀴드 글래스 배경 + blur, `border-radius: 14px`. 헤더 없이 바로 `--padded`만 써도 됩니다.

### 통계 카드 / 구분선 / 빈 상태
- `.pc-stat-card`, `.pc-stat-grid`, `.pc-stat-icon` — 숫자 요약 카드
- `.pc-divider` — 텍스트 포함 가능한 구분선 (`<div className="pc-divider"><span>또는</span></div>`)
- `.pc-empty` — "데이터 없음" 빈 상태 플레이스홀더

---

## 5. 아이콘

**lucide-react**를 표준으로 사용합니다. 크기는 문맥에 따라 13~22px, 색상은 `currentColor` 상속을 기본으로 하고 필요시 브랜드 컬러를 직접 지정합니다.
```tsx
import { Calendar, CheckCircle2 } from "lucide-react";
<Calendar size={14} />
```

---

## 6. 레거시 패턴 — 페이지 로컬 컬러 객체

`color-check`, `photo-retouching`, `conti`, `trend-dashboard` 등 여러 기존 페이지는 `.pc-*` 공통 클래스 대신 **파일 상단에 로컬 `C` 객체를 선언하고 인라인 `style={{}}`로 직접 스타일링**하는 더 오래된 패턴을 씁니다:
```tsx
const C = {
  teal: "#155855", orange: "#E85D2C",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", bg: "#EDF5F3",
};
```
값은 `.pc-*` 시스템의 브랜드 컬러와 대부분 동일하지만(그린/오렌지 톤은 같음), 클래스 재사용이 안 되고 페이지마다 미묘하게 수치가 다릅니다(예: 배경이 `--ivory` 대신 `#EDF5F3`인 경우). **새 페이지를 만들 때는 이 패턴을 새로 베끼지 말고 `.pc-*` 클래스 + CSS 변수를 우선 사용하세요.** 기존 페이지를 수정할 때는 이미 있는 로컬 패턴을 따라가는 것이 일관성 있습니다(전체를 `.pc-*`로 리팩터링하는 건 별도 작업으로 분리).

---

## 7. `.ops-*` 시스템 (독립 레이아웃, 흡수하지 않음)

`subscription`, `content-writer`, `sns-design`, `channel-audit`, `content-calendar`, `assets`, `monthly-report` 7개 페이지는 `.pc-header` + `.pc-card` 그리드 대신 **큰 히어로 타이틀 + 표 형태 목록**에 맞춘 별도 클래스 세트(`.ops-shell`/`.ops-header`/`.ops-panel`/`.ops-table-card`/`.ops-table-head`/`.ops-table-row`)를 씁니다 (`app/globals.css` 899줄~).

```tsx
<div className="ops-shell">
  <header className="ops-header">
    <p>EYEBROW LABEL</p>
    <h1>페이지 제목</h1>
    <span>설명 문구</span>
  </header>
  <div className="ops-table-card">
    <div className="ops-table-head">{/* 컬럼 헤더 */}</div>
    <a className="ops-table-row">{/* 행 */}</a>
  </div>
</div>
```

**`.pc-*`와 같은 CSS 변수(`--liquid-panel-strong`, `--liquid-border`, `--mesh-bg`, `--deep-green`, `--orange`)를 그대로 재사용**하므로 색감·블러 톤은 이미 통일돼 있습니다 — 다만 컴포넌트 이름과 6컬럼 그리드 레이아웃이 `.pc-card`/`.pc-header`와 다릅니다.

**방침: 문서화만 하고 `.pc-*`로 흡수하지 않습니다.** 7개 페이지 모두 표 형태 목록 화면이라 `.ops-table-*`가 `.pc-card` 그리드보다 실제로 더 적합하고, 이미 완결된 상태로 잘 동작합니다. `.pc-*`로 강제 통일하면 7개 페이지를 사실상 다시 짜야 하는데 비해 얻는 이득(순수 클래스 이름 통일)이 크지 않아 별도 시스템으로 유지합니다. 새로 이 7개 페이지 중 하나를 수정할 때는 `.ops-*` 패턴을 따라가고, 아예 새 "표 목록형" 페이지를 만들 때만 `.ops-*` 재사용을 고려하세요.

---

## 8. 빠른 체크리스트 (새 페이지 만들 때)

1. `"use client"` + `<header className="pc-header">`로 시작
2. 본문은 `<div className="pc-content">`로 감싸기 (mesh 배경은 자동 적용됨)
3. 버튼/배지/카드는 `.pc-btn` / `.pc-badge` / `.pc-card` 우선 사용
4. 브랜드 컬러는 하드코딩 대신 `var(--deep-green)` / `var(--orange)` 사용
5. 아이콘은 lucide-react
6. 폰트는 기본 Noto Sans KR로 충분한지 먼저 확인, 필요할 때만 페이지별 폰트 추가
