# 태블릿(iPad Pro) 홈 화면 + 메모·음성메모 개편 개발 명세서

- 작성일: 2026-09-22
- 성격: **코드 변경 없음.** 현재 저장소 코드를 직접 읽고 확인한 사실 기반 분석 + 다음 세션이 바로 착수할 수 있는 개편 방향/체크리스트.
- 조사 범위: `components/olivia-tablet/*`, `components/olivia-os/*`(비교용), `lib/olivia/mobile/adaptiveSurface.ts`, `lib/olivia/tablet/navigation.ts`, `components/memo/*`, `components/voice/*`, `lib/memo/*`, `lib/voice/*`, `app/api/voice/*`, `lib/toolNav.ts`.
- 관련 기존 문서: [`OLIVIA-UI-ROLLOUT-PROGRESS.md`](../OLIVIA-UI-ROLLOUT-PROGRESS.md)(데스크톱 라우트 리스타일 9단계 롤아웃 — 이 문서와는 별개 트랙), [`docs/design-guide.md`](./design-guide.md)(브랜드 컬러/컴포넌트 — `.pc-*` 데스크톱 페이지 기준, 태블릿 셸은 자체 CSS Module을 씀).

---

## 0. 한눈에 보기

가장 중요한 발견 3가지부터:

1. **iPad Pro를 포함한 대부분의 실제 iPad가 세로모드에서는 "태블릿 화면"이 아니라 "모바일(휴대폰) 화면"으로 렌더링된다.** 화면 분기 기준값이 좁아서 생긴 버그성 갭이다 — "아이패드 프로처럼" 만들기 전에 가장 먼저 고쳐야 할 부분. (§2.1)
2. **태블릿 홈 화면(바탕화면)은 전체 139개 라우트 중 13개만 보여준다.** 나머지는 아예 진입로가 없다. 데스크톱(마우스) 쪽엔 이미 "모든 앱" 창 + 즐겨찾기 서버 저장이 있는데, 태블릿엔 그 인프라가 연결되어 있지 않다. (§2.4, §2.5)
3. **"음성메모"는 사실 두 개의 서로 다른, 서로 연결되지 않은 시스템이다.** 게다가 그중 회의용 녹음("음성 기록")은 지난 녹음을 다시 찾아 들을 수 있는 목록 화면/조회 API가 코드베이스 어디에도 없다 — 방금 끝난 녹음의 "기록 보기" 링크를 놓치면 사실상 못 찾는다. (§7)

아래는 섹션별 상세 분석과, 각 문제에 대한 개편 방향(코드 아님, 설계 방향 + 결정 필요 항목)이다.

---

## 1. 태블릿 화면 현재 구조

### 1.1 화면 분기 로직 — 여기부터 문제가 있다

`app/page.tsx` → `OliviaAdaptiveRoot`(`components/olivia-mobile/OliviaAdaptiveRoot.tsx`) → `resolveOliviaSurface()`(`lib/olivia/mobile/adaptiveSurface.ts`)가 화면을 `mobile` / `tablet` / `desktop` 세 갈래로 나눈다.

```
OLIVIA_MOBILE_MAX_WIDTH = 820
OLIVIA_COARSE_PORTRAIT_MAX_WIDTH = 900

width <= 820                                              → mobile
coarsePointer && width <= 900 && height >= width          → mobile   (세로형 터치 기기)
coarsePointer && width > 900                               → tablet
그 외(마우스/트랙패드)                                          → desktop
```

이 기준을 실제 iPad 논리 해상도(CSS px, 세로모드 기준)에 대입하면:

| 기기 | 세로모드 width | 판정 |
|---|---|---|
| iPad mini | 744 | **mobile** |
| iPad (10세대 등 기본형) | 820 | **mobile** (경계값 포함) |
| iPad Air 11" | 820~834 | **mobile** |
| **iPad Pro 11"** | **834** | **mobile** |
| iPad Pro 12.9"/13" | 1024 | tablet |

→ **iPad Pro 11"를 포함해 세로모드로 쓰는 거의 모든 iPad가 `OliviaTabletShell`이 아니라 `OliviaMobileShell`(휴대폰용 UI)을 받는다.** 가로모드로 돌리면 그제서야 `tablet`으로 분류된다(가로 1194 > 900). 즉 지금 "아이패드 프로 같은 홈 화면"을 아무리 잘 만들어도, 세로로 들고 메모하거나 회의록을 녹음하는 가장 흔한 사용 패턴에서는 그 화면 자체가 뜨지 않는다.

참고로 기기 자체를 정확히 구분하는 로직은 이미 존재한다 — `detectVoiceDevice()`(`components/voice/OliviaRecorder.tsx:35`)가 `/iPad/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)`로 iPadOS의 "Mac으로 위장하는" UA까지 정확히 잡아낸다. 다만 이 판별기는 음성 녹음 업로드 메타데이터(device_type)에만 쓰이고, 정작 화면 분기(`resolveOliviaSurface`)에는 연결되어 있지 않다.

**개편 시 결정 필요**: 화면 분기를 폭(width) 휴리스틱 대신(또는 병행해서) 기기 판별 결과로 보강할지, 아니면 폭 기준값 자체를 조정할지는 다른 화면(모바일 웹뷰, 안드로이드 태블릿, 접이식 기기 등)에도 영향을 주므로 이번 문서에서 임의로 정하지 않는다. 다만 "세로모드 iPad가 모바일 셸로 빠지는 것"은 사실상 버그에 가까우므로 우선순위 1로 제안한다.

### 1.2 화면 레이아웃 구조 (판정이 `tablet`일 때)

`OliviaTabletShell.tsx`가 셸 전체를 담당한다. 구조는 단순하고 견고하다:

- `TabletTopBar` — 상단 고정 바(64px, safe-area 대응). 홈이 아니면 뒤로가기 버튼 + 앱 이름, 우측엔 날짜만.
- `TabletAppContent` — 가운데 뷰포트. `activeApp`에 따라 `switch`문으로 컴포넌트를 고른다.
- `TabletDock` — 하단 고정 독(모든 `TABLET_APPS`를 가로 스크롤 아이콘 바로 표시).
- 브라우저 URL의 `tabletApp` 쿼리 파라미터로 내비게이션 상태를 표현(`lib/olivia/tablet/navigation.ts`) — 뒤로가기/새로고침에 강함. 잘 설계되어 있다.

`activeApp`은 `TabletAppId`(`lib/olivia/tablet/navigation.ts:1`)라는 **13개짜리 고정 union 타입**이다: `home, customer, calendar, conti, documents, olivia-chat, review-studio, memo, quote-contract, channel-analysis, brand-image, voice, photo-workspace`.

### 1.3 홈 화면(바탕화면) — `TabletHome.tsx`

이미 iPad 느낌을 어느 정도 낸 컴포넌트다:
- 6열 아이콘 그리드(세로모드 5열, 좁은 화면 4열), 배경(mint/ivory/green/sunset) 선택, 위젯(오늘 일정/할 일) on-off — 전부 `localStorage`(`olivia:tablet:*`)에 저장.
- "그룹화" 토글 한 개로 `APP_GROUPS`(업무 관리 / 콘텐츠 제작 / 분석 및 도구, `TabletHome.tsx:21`) 3개 섹션을 세로로 쌓아 보여줄 수 있음.

하지만 이건 **"카테고리 섹션이 세로로 접혔다 펴지는 아코디언"**이지, 사용자가 요청한 **"카테고리별로 슬라이드(스와이프)되는 페이지"**가 아니다. 좌우 스와이프, 페이지 인디케이터(점), 폴더(길게 눌러 앱 묶기), 아이콘 드래그 재배치 — 이런 iPad 홈 스크린의 핵심 상호작용이 전부 없다.

### 1.4 앱 접근성 — 13개 vs 139개

`app/` 아래 실제 페이지 라우트는 `find app -name page.tsx`로 세면 **139개**다. 이 중 태블릿에서 실제로 열 수 있는 것은 `TabletAppContent.tsx`의 switch에 있는 **13개뿐**이다. 이 13개도 두 부류로 나뉜다:

- **네이티브 어댑터** 7개 — `customer, calendar, documents, review-studio, memo, conti, channel-analysis, brand-image`는 데스크톱용 `*WindowContent` 어댑터나 페이지 컴포넌트를 `dynamic import`로 그대로 재사용(`TabletAppContent.tsx:23-54`). 태블릿 셸 안에서 자연스럽게 열리고 상태도 유지된다.
- **전용 태블릿 컴포넌트** — `home`(TabletHome), `voice`(TabletVoice→OliviaRecorder embedded), `quote-contract`(TabletQuoteContract), `photo-workspace`(TabletPhotoRemote).

나머지 **약 126개 라우트는 태블릿에서 진입로 자체가 없다.** `default:` 분기가 그냥 `TabletHome`으로 떨어지기 때문에, 아이콘도 없고 검색도 없어서 존재 자체를 알 수 없다.

참고로 데스크톱(마우스) 쪽은 이미 이 문제를 어느 정도 풀어놨다 — `AllAppsWindowContent.tsx`가 `lib/toolNav.ts`의 `ALL_TOOLS`(43개, `dashboard`/`crm`/`tools` 3개 카테고리)를 탭으로 분류해서 보여주고, `/api/desktop-settings`에 즐겨찾기를 서버 저장한다. **태블릿은 이 인프라를 전혀 쓰지 않는다** — 재사용 가능한 부분이 이미 있다는 뜻.

### 1.5 죽은 코드 발견 — `TabletRouteFrame.tsx`

`components/olivia-tablet/TabletRouteFrame.tsx`는 임의의 데스크톱 라우트를 `iframe`(+`?oliviaEmbedded=1`)으로 태블릿 셸 안에 띄우는 fallback으로 보인다. 그런데 `grep` 결과 **어디에서도 import되지 않는다** — 완전한 미사용 컴포넌트다. "전체 앱을 태블릿에서 열리게 하자"는 요구를 빠르게 만족시킬 수 있는 뼈대가 이미 만들어져 있었는데 연결만 안 된 상태 — §4.2의 제안에서 이 파일을 되살리는 방향을 다룬다.

### 1.6 독(Dock)의 구조적 한계

`TabletDock.tsx`는 `TABLET_APPS`(13개) 전부를 그대로 순서대로 나열한다 — 사용자 커스터마이징 불가, 즐겨찾기 개념 없음. 홈 화면에 노출되는 앱 카탈로그가 지금처럼 13개면 문제가 안 되지만, §2에서 제안하는 대로 카탈로그를 139개로 넓히면 **독까지 자동으로 따라 늘어나면 안 된다** — 실제 iPad 독처럼 "자주 쓰는 소수(±15개)만, 사용자가 고를 수 있게"로 별도 관리가 필요하다.

---

## 2. iPad Pro UX 대비 갭 정리

| 항목 | 지금 있음 | iPad Pro 기준 | 갭 |
|---|---|---|---|
| 화면 분기 정확도 | width 휴리스틱 | 기기 자체 인식 | 세로 iPad가 폰 UI로 빠짐 (§1.1) |
| 홈 아이콘 카탈로그 | 13개 고정 | 설치된 모든 앱 | 126개 라우트 진입로 없음 (§1.4) |
| 카테고리 표시 방식 | 세로 아코디언 3그룹 | 페이지 스와이프 + 폴더 | 스와이프/페이지 인디케이터 없음 |
| 아이콘 배치 | 고정 순서 | 드래그로 재배치, 폴더 생성 | 편집 모드 없음 |
| 검색(Spotlight) | 없음 | 홈 위 당겨서 검색 | 태블릿 셸에 검색 진입점 없음(데스크톱엔 `DesktopGlobalSearch` 존재) |
| 즐겨찾기 동기화 | `localStorage`만(기기별) | iCloud로 기기 간 동기화 | 데스크톱 즐겨찾기(`/api/desktop-settings`, 서버 저장)와 태블릿 그룹/배경 설정(`localStorage`)이 서로 다른 저장소 — Mac에서 정리한 즐겨찾기가 iPad엔 안 보임 |
| 독 커스터마이징 | 없음(13개 고정 표시) | 사용자가 최대 ~15개 선택 | 카탈로그 확장 시 독도 같이 폭발할 위험 |
| 위젯 | 홈 위젯 2종(오늘 일정/할 일), on/off만 | 다양한 위젯, 크기 조절 | 확장 여지 있으나 최소 기능은 이미 있음(양호) |

---

## 3. 홈 화면(바탕화면) 개편 방향

### 3.1 원칙

- **1단계**: 화면 분기 버그부터 고친다(§1.1). 이게 안 고쳐지면 나머지는 전부 "가끔 보이는 화면"이 된다.
- **2단계**: 앱 카탈로그를 "네이티브 어댑터 있는 13개"와 "나머지 126개"로 구분해서 노출한다 — 전부 똑같은 품질인 척하지 않는다. 126개는 데스크톱 페이지를 그대로 `iframe`(되살린 `TabletRouteFrame`)으로 열되, 아이콘에 "터치 최적화 준비 중" 같은 미묘한 표시(기존 `TabletAppDefinition.disabled` 필드 재활용 가능, 지금은 아무 앱도 안 씀)를 줘서 품질 기대치를 정직하게 관리한다.
- **3단계**: 카테고리를 세로 아코디언이 아니라 **가로로 스와이프되는 페이지**로 바꾼다. `lib/toolNav.ts`의 3카테고리(`dashboard/crm/tools`)와 `TabletHome.tsx`의 3그룹은 서로 다른 분류 체계다 — 하나로 통합할지, 태블릿 전용 카테고리를 새로 짤지는 라벨링 작업이라 이번 문서에서 확정하지 않고 §5에 결정 필요 항목으로 남긴다.

### 3.2 제안하는 홈 구조 (iPad 벤치마크)

1. **1페이지 = "즐겨찾기/자주 쓰는 앱"** — 데스크톱의 `favoriteAppKeys`(`/api/desktop-settings`)를 태블릿에서도 읽어와 공유. 여기서부터 "Mac에서 즐겨찾기 해두면 iPad에도 보인다"가 성립한다.
2. **2페이지부터 카테고리별 페이지** — 업무 관리 / 콘텐츠 제작 / 분석·진단 / AI 도구 등(정확한 라벨은 §5에서 결정). 한 페이지당 아이콘 수를 실사용 그리드 용량(6열×3~4행 정도)으로 제한하고, 넘치면 다음 페이지로 이어지거나 "폴더"로 묶는다.
3. **폴더(선택)** — 카테고리 안에서도 세부가 많은 경우(`tools`가 28개로 제일 큼) iPad처럼 탭하면 확대되는 폴더 오버레이 제공.
4. **페이지 인디케이터 점 + 좌우 스와이프 제스처**, 길게 눌러 "편집 모드"(흔들림 + 재배치 + 숨김) — 이 부분은 실제 컴포넌트 설계가 필요한 영역이라 다음 세션에서 인터랙션 프로토타입부터 잡는 걸 권장.
5. **검색 진입**: 상단 바에 검색 아이콘 추가 → 기존 `DesktopGlobalSearch`(`components/olivia-os/DesktopGlobalSearch.tsx`)의 fuzzy-alias 검색 로직을 재사용(`ALL_TOOLS`의 `aliases` 필드가 이미 이런 용도로 채워져 있음).
6. **독 재정의**: 독은 카탈로그 확장과 무관하게 "최대 15개, 사용자가 고정" 정책으로 별도 관리. 기존 `TABLET_APPS` 13개를 기본 독 구성으로 재활용 가능.

### 3.3 단계별 로드맵 제안

| 단계 | 내용 | 리스크 |
|---|---|---|
| A | 화면 분기 로직 수정(세로 iPad → tablet) | 다른 태블릿(안드로이드)/폴더블 기기 회귀 테스트 필요 |
| B | `TabletRouteFrame` 되살려서 126개 라우트를 "카테고리 페이지"에서 최소한 열리게라도 함 | iframe 안에서 터치 타깃 크기, 스크롤 충돌 등 개별 페이지별 검증 필요(전수 검사는 별도 세션) |
| C | 홈을 아코디언 → 스와이프 페이지 구조로 교체 | 기존 `localStorage` 설정(배경/위젯/그룹 여부) 마이그레이션 필요 |
| D | 즐겨찾기를 서버 저장(`desktop-settings`)으로 통합, 데스크톱과 공유 | 기존 태블릿 `localStorage` 그룹 설정과 개념이 다름 — 병합 정책 결정 필요 |
| E | 독 커스터마이징 + 검색 진입점 | UI 신규 설계 |

---

## 4. 메모(Notes) 기능 현황 분석

핵심 파일: [`components/memo/MemoWorkspace.tsx`](../components/memo/MemoWorkspace.tsx)(323줄), [`NoteCanvasPanel.tsx`](../components/memo/NoteCanvasPanel.tsx), [`VoiceMemoPanel.tsx`](../components/memo/VoiceMemoPanel.tsx), [`lib/memo/types.ts`](../lib/memo/types.ts).

**좋은 점**: 데스크톱 창(`MemoWindowContent`), 태블릿(`TabletMemo`, 결국 같은 `MemoWindowContent` 재사용), `/memo` 단독 라우트가 전부 **동일한 `MemoWorkspace` 컴포넌트 하나**를 쓴다. 화면마다 따로 구현되어 갈라지는 문제가 없다 — 이건 그대로 유지해야 할 좋은 구조다.

**데이터 모델**(`ConsultationMemo`): 메모 1건 = 제목 + `template_type`(일반/코넬/할일/백지/모눈/콘티) + `template_data` + 텍스트 본문(`raw_memo`) + 캔버스 필기 이미지 1장 + **음성 1개**(`audio_url`/`transcript`/`audio_summary`) + AI 정리 결과.

발견한 구체적 갭:

1. **목록 화면이 매우 단순하다.** 좌측 "저장된 메모" 아코디언(기본 접힘)에 제목 + 수정일만 나열 — 검색창, 썸네일 미리보기, 고정(pin), 태그/색상 라벨, 정렬 옵션이 전혀 없다. 메모가 몇십 개만 쌓여도 원하는 걸 찾기 어렵다.
2. **음성 첨부는 메모당 1개뿐이다.** `VoiceMemoPanel`은 `blobRef` 하나만 들고 있어서, 새로 녹음하면 이전 녹음을 덮어쓴다. 회의 중 여러 번 나눠 녹음하는 흐름을 못 받는다.
3. **"AI 정리"가 캔버스에만 적용된다.** 헤더 문구는 "텍스트·필기·음성을 한 화면에서 함께 기록"이라고 하지만, 실제 "텍스트로 정리/이미지로 정리" 버튼(`memo-ai-card`)은 캔버스 필기만 대상으로 한다. 음성 요약(`audioSummary`)은 `VoiceMemoPanel` 팝오버 안에 따로 표시될 뿐, 캔버스의 `applyAiText()`처럼 "메모 본문에 반영" 버튼이 없다 — 사용자가 수동으로 복사해야 한다.
4. **컨텍스트 필터가 UI에 없다.** 메모를 고객/프로젝트/일정/할일에 묶는 `context_type`/`context_id`는 서버 쿼리 파라미터로만 동작하고, `/memo` 화면 자체에는 "전체 / 이 고객 것만" 같은 필터 컨트롤이 없다.
5. **태블릿에서 목록이 기본 접혀 있다.** 세로 모드에서는 그렇다 쳐도, 가로로 넓게 쓰는 iPad Pro에서도 항상 접힌 채로 시작해서 "새 메모 작성"에만 집중된 레이아웃이다 — 목록 상시 노출(2단 분할)이 자연스러운 화면 크기에서도 그렇다.

---

## 5. 메모 개편 방향 제안 (Apple Notes 벤치마크)

1. **목록 화면 강화**: 검색창(제목+본문 텍스트 검색), 정렬(수정순/제목순), 고정(pin), 그리드(썸네일)/리스트 보기 토글.
2. **컨텍스트를 폴더처럼 노출**: `context_type`별 세그먼트 필터("전체 / 고객 / 프로젝트 / 일정 / 할일")를 목록 상단에 추가.
3. **음성 다중 첨부**: 메모 1건에 음성 여러 개를 타임라인으로 붙일 수 있게 데이터 모델(`audio_url` 단일 컬럼 → 첨부 배열) 확장 여부 결정 — 스키마 변경이 필요한 범위라 다음 세션에서 마이그레이션 계획과 함께 다뤄야 한다.
4. **AI 정리 통합**: 음성 요약에도 캔버스처럼 "메모 본문에 반영" 버튼을 추가해서, 필기 정리와 음성 정리가 같은 자리에서 동일한 방식으로 동작하게 맞춘다.
5. **태블릿 레이아웃**: 가로 모드(iPad Pro 가로 1194px 이상)에서는 목록을 기본으로 펼친 2단 분할(좌: 목록, 우: 편집기) 상시 유지, 세로 모드에서는 지금처럼 접이식 유지.

**결정이 필요한 항목** (이번 문서에서 임의로 정하지 않음):
- 음성 다중 첨부를 실제로 할지 — 스키마/스토리지 비용 변화가 있음.
- 메모 폴더/태그를 `context_type`(고정 5종) 재사용으로 할지, 사용자 정의 태그를 새로 만들지.
- 버전 이력(되돌리기) 지원 여부 — 범위가 커서 별도 스코프로 분리 권장.

---

## 6. 음성메모(Voice) 기능 현황 — 두 개로 나뉜 시스템

이게 가장 큰 발견이다. "음성메모"라고 부르는 기능이 실제로는 **서로 코드도, 데이터도, 진입점도 다른 두 시스템**으로 나뉘어 있다.

| | A. 음성 기록 (전용 앱) | B. 메모 안 음성 첨부 |
|---|---|---|
| 파일 | `components/voice/OliviaRecorder.tsx`(709줄) + `VoiceRecordingDetail.tsx` | `components/memo/VoiceMemoPanel.tsx`(161줄) |
| 라우트/진입점 | `/voice-recorder`, 태블릿 독의 "음성 기록" | 메모 편집기 툴바의 마이크 버튼 |
| API | `/api/voice/sessions*` → `voice_recordings` 테이블 | `/api/memo/assets`, `/api/memo/transcribe` → 메모 레코드에 병합 |
| 화자 분리(diarization) | 있음 | 없음 |
| AI 요약/핵심내용/할일 추출 | 있음(구조화된 필드로 분리 저장) | 요약 텍스트 1개만 |
| 업로드 견고성 | Signed URL 업로드, 실패 시 재시도, `localStorage` 기반 미완료 세션 복구, Wake Lock, 페이지 이탈 감지 | 녹음 종료 즉시 자동 처리, 별도 복구/재시도 로직 없음 |
| 서로 연결 | 안 됨 — 메모의 음성을 회의록으로 승격하거나, 회의 녹음을 메모에 첨부하는 경로 없음 | |

그리고 **A(음성 기록) 쪽에는 결정적인 결함이 있다**: 지난 녹음을 다시 찾아볼 수 있는 화면이 없다.

- `app/api/voice/sessions/route.ts`에는 `POST`(세션 생성)만 있고, 목록을 돌려주는 `GET`이 없다. `voice_recordings` 테이블을 조회하는 API 자체가 없다.
- `/voice-recorder` 페이지는 "새로 녹음 시작" 화면 하나뿐이고, 히스토리 목록 UI가 어디에도 없다.
- `VoiceRecordingDetail`(개별 기록 상세)로 가는 링크는 오직 "방금 그 녹음을 끝낸 직후" 결과 화면(`onOpenResult`/`Link href={/voice-recorder/${sessionId}}`)에만 존재한다.
- 코드베이스 전체를 검색해도 이 상세 페이지로 들어가는 다른 진입로(고객 상세, 캘린더, 검색 등)가 없다.

즉, 방금 만든 녹음의 "기록 보기" 버튼을 놓치거나 앱을 나가면, 관리자가 데이터베이스를 직접 조회하지 않는 한 **그 회의록은 사실상 다시 찾을 수 없다.** "음성메모를 제대로 개편하고 싶다"는 요청의 실질적 원인이 여기 있을 가능성이 높다.

부가로: 제품 라벨은 "음성 기록"인데 사용자는 대화에서 "음성메모"라고 부른다 — `lib/toolNav.ts`의 alias 목록(`["녹음","음성녹음","음성 기록",...]`)에도 "음성메모"라는 단어 자체는 없다. 검색/명명 통일도 함께 볼 필요가 있다.

---

## 7. 음성메모 개편 방향 제안

1. **목록 화면 신설 (최우선)**: `voice_recordings`를 조회하는 목록 API + Apple Voice Memos 스타일 화면(왼쪽/상단 녹음 목록 — 제목, 날짜, 길이, 상태 배지 / 오른쪽 또는 하단 상세·재생) 필요. 이게 없으면 나머지 개선이 의미가 줄어든다.
2. **두 시스템의 관계 정리 — 결정 필요**: 두 유스케이스(빠른 메모용 vs 회의 기록용)를 의도적으로 유지할지, 하나로 합칠지 결정해야 한다. 권장안은 "유지하되 서로 승격/연결 가능하게" — 메모 안의 짧은 음성을 "회의 기록으로 승격"하거나, 완료된 회의 기록을 특정 메모/고객에 링크하는 액션 추가. 다만 이건 제품 방향 결정이라 이번 문서에서 확정하지 않는다.
3. **업로드 견고성 격차 해소**: `OliviaRecorder`에 이미 있는 재개 가능한 업로드/Wake Lock/이탈 감지 로직을 `VoiceMemoPanel`에도 적용해, 메모 안 음성 녹음도 앱 전환·화면 이탈 시 유실 위험을 줄인다.
4. **네이밍 통일**: 제품 라벨("음성 기록")과 사용자가 실제로 부르는 말("음성메모")을 맞출지 결정 — 검색 alias에 "음성메모"를 추가하는 것만으로도 발견성이 개선된다.
5. **화자 분리 옵션화**: 메모 안 음성 첨부에도 화자 분리를 옵션으로 제공할지 결정(비용/지연 트레이드오프 있음).
6. **태블릿 홈/독 라벨 정합성**: `tabletApps.ts`의 `voice`(현재 "음성 기록") 아이콘이 신설되는 목록 화면의 진입점이 되도록 갱신.

---

## 8. 확인이 필요한 항목 (사용자 결정 필요, 이번 문서에서 임의로 정하지 않음)

- 화면 분기 기준 조정 범위 — iPad만 고칠지, 안드로이드 태블릿/폴더블까지 같이 재검토할지.
- 126개 롱테일 라우트를 태블릿에서 iframe으로 열 때, 전수 검사(터치 타깃, 가로 스크롤 충돌 등) 스코프와 우선순위.
- 메모 음성 다중 첨부를 위한 스키마 변경 여부.
- 음성 기록 ↔ 메모 간 승격/연결 기능을 이번 개편에 포함할지, 다음 단계로 미룰지.
- 홈 화면 카테고리 라벨 체계를 `lib/toolNav.ts`의 기존 3분류(`dashboard/crm/tools`)에 맞출지, 태블릿 전용으로 새로 짤지.

## 9. 이번 문서에서 다루지 않은 것

- 실제 컴포넌트/CSS 구현, 마이그레이션 SQL, API 스펙 상세 — 방향 확정 후 별도 구현 세션에서 진행.
- 모바일(휴대폰) 셸의 메모/음성 UX 재검토(§1.1 분기 수정의 부수 효과는 있으나, 모바일 자체 개편은 범위 밖).
- 데스크톱(마우스) `OliviaDesktop`의 자체 리스타일(그건 `OLIVIA-UI-ROLLOUT-PROGRESS.md` 트랙에서 진행 중인 별개 작업).
