# 사진/영상 작업실 UI 통일 요청서

작성일 2026-10-05 · 기준 코드 v20 (`Olivia-agent-main`)

---

## 0. 최우선 원칙

**이 문서에 적힌 것만 한다. 로직 외에 판단은 절대 금지.**

- 기능·동작 로직은 5장에 적힌 것 외에 건드리지 않는다.
- 이 문서에 없는 색·굵기·간격을 "더 나아 보여서" 바꾸지 않는다.
- 값이 안 적힌 곳이 있으면 **그대로 둔다**. 추측해서 채우지 않는다.
- 파일을 새로 만들지 않는다. 기존 파일만 고친다.
- 작업 끝나고 8장 체크리스트를 그대로 채워서 회신한다.

### 어두운 패널을 밝게 바꾸지 않는다

`components/photo-workspace/PhotoWorkspace.module.css` 69행 주석에 이유가 적혀 있다 — 사진 색을 판단하는 화면이라 아이보리 배경에서는 색이 따뜻하게 왜곡돼 보인다. **어두운 작업 패널은 기준이고, 나머지를 거기 맞춘다.**

---

## 1. 색

### 1-1. 쓸 색 (이 외의 색을 작업실에 새로 만들지 않는다)

**밝은 화면** — 목록 · 기획 · 가이드 패널 · 폼

| 역할 | 값 |
|---|---|
| 주조 | `#155855` |
| 실행 | `#C94A1E` |
| 바탕 | `#FDFCFA` / 카드 `#FFFFFF` |
| 흐린 글자 | `#5A7470` |

**어두운 작업 패널** — 사진이 실제로 보이는 곳

| 역할 | 값 |
|---|---|
| 바탕 | `#2A2A2A` (그라데이션 없음) |
| 실행 | `#37C39D` · 글자 `#103E36` |
| 선택 표시 | `#4FD8B8` |
| 속 카드 | `rgba(255,255,255,.04)` · 테두리 `rgba(255,255,255,.10)` |
| 글자 | `#FFFFFF` / 흐린 글자 `rgba(255,255,255,.55)` |

### 1-2. 어두운 바탕을 하나로

| 파일 | 줄 | 지금 | 바꿀 값 |
|---|---|---|---|
| `components/photo-workspace/PhotoTcutWorkspace.module.css` | 1 | `.surface { background: radial-gradient(circle at 80% 0%, rgba(42,145,131,.15), transparent 30%), #202827; }` | `.surface { background: #2A2A2A; }` (color 속성은 그대로) |
| `components/photo-workspace/PhotoRenameWorkspace.module.css` | 1 | `.surface { background: radial-gradient(circle at 78% 0%, rgba(42,145,131,.16), transparent 28%), #202827; }` | `.surface { background: #2A2A2A; }` (color 속성은 그대로) |

이유 — 초록 그라데이션이 깔리면 중성 회색으로 둔 이유 자체가 없어진다.

### 1-3. 원격 패널도 어둡게

`components/photo-workspace/RemotePhotoSelectWorkspace.module.css`

- 7~13행 `.intro, .panel, .result` 의 `background: #fff` → **`.panel` 만 분리해서 `background: #2A2A2A`**, 테두리 `1px solid rgba(255,255,255,.08)`
- `.panel` 안쪽 글자색을 `#FFFFFF` / `rgba(255,255,255,.55)` 로 맞춘다
- `.intro` 와 `.result` 는 흰색 그대로 둔다

이유 — 작업 위치를 `Mac Studio 원격 작업`으로 바꾸면 같은 사진 셀렉 탭이 어두운 패널에서 흰 패널로 바뀐다. 사진 색이 왜곡되면 안 되는 건 원격도 같다.

### 1-4. 파란 강조색 제거

`components/photo-classifier/PhotoSortingWorkspace.tsx` 에서 `#103A62` → `#155855`, `#E8F0F5` → `#EAF4F2` 로 전부 치환.

해당 줄: **3069, 3076, 3368, 3400, 3419, 3567, 3610, 3619, 3637**

`app/globals.css` 13행의 `--ui-teal: #103A62` **변수 자체는 지우지 않는다** — `app/admin/`, `app/mailing/`, `app/(client-hub)/` 가 아직 쓴다. 사진 작업실 쪽 사용처만 바꾼다.

### 1-5. 어두운 패널 위의 버튼 색

`components/photo-workspace/PhotoWorkspace.module.css` 135행

```
.primaryButton { border: 1px solid #155855; background: #155855; color: #fff; }
```

→

```
.primaryButton { border: 1px solid #37C39D; background: #37C39D; color: #103E36; }
```

이유 — `#155855` 를 `#2A2A2A` 패널 위에 올리면 명암비 **1.8:1**로 버튼 모양 자체가 보이지 않는다. `#37C39D` 는 **6.5:1**.

### 1-6. 주황 버튼 글자

흰 글자를 `#E85D2C` 위에 올리면 **3.5:1** 로 작은 글자 기준(4.5:1)에 못 미친다.

- **버튼·칩처럼 흰 글자를 올리는 곳만** `#C94A1E` (4.7:1)
- 로고·그래픽·아이콘 배경의 `#E85D2C` 는 **그대로 둔다**
- `app/globals.css` 15행 `--orange` 변수는 그대로. 버튼 쪽에서만 `#C94A1E` 를 쓴다

---

## 2. 탭

### 2-1. 탭은 두 단계뿐

1. **작업실 탭** — 회색 알약 바(`#EDF0EE`) 안에 흰 알약. 선택된 것만 흰 알약 + `#155855` 글자·아이콘
2. **패널 안 서브탭** — 밑줄형. 어두운 패널에서는 흰 글자 + `#4FD8B8` 밑줄 2px

**세 번째 모양(네모 테두리형)은 쓰지 않는다.** `components/photo-classifier/PhotoSortingWorkspace.tsx` 의 네모 테두리 탭을 위 1번 모양으로 바꾼다.

### 2-2. 컬러 네모 아이콘 → 선 아이콘

`components/photo-workspace/PhotoWorkspaceTabs.tsx`

| 줄 | 지금 | 바꿀 것 |
|---|---|---|
| 17 | `<AppIcon name="metadata-select" size={15} />` | `<Link2 size={15} strokeWidth={2} aria-hidden="true" />` |
| 19 | `<AppIcon name="raw-select" size={15} />` | `<Scissors size={15} strokeWidth={2} aria-hidden="true" />` |
| 22 | `<AppIcon name="retouch" size={15} />` | `<Palette size={15} strokeWidth={2} aria-hidden="true" />` |

- `lucide-react` import 에 `Link2, Palette, Scissors` 추가
- `AppIcon` import 가 이 파일에서 더 안 쓰이면 제거
- **`components/AppIcon.tsx` 와 `APP_ICON_BG` 는 건드리지 않는다.** 다른 화면이 쓴다

이유 — `AppIcon` 은 색 채운 네모를 그린다(`metadata-select` 파랑 `#3D8FB8`, `raw-select` 초록, `retouch` 주황). 같은 탭 줄에서 셋만 색 네모, 넷은 선 아이콘이 된다.

### 2-3. 이모지 제거

RAW 매칭 카드와 레거시 탭 라벨의 `📁 💬 ⬆️` 를 같은 자리 `lucide-react` 선 아이콘으로 바꾼다. 크기 15, `strokeWidth={2}`, 색은 그 자리의 글자색과 같게.

---

## 3. 버튼

### 3-1. 역할은 넷. 바탕에 따라 색만 바뀐다

| 역할 | 밝은 화면 | 어두운 패널 |
|---|---|---|
| 주 실행 | `#C94A1E` 채움 · 흰 글자 | `#37C39D` 채움 · 글자 `#103E36` |
| 보조 | 흰 바탕 · `#155855` 외곽선 1px · `#155855` 글자 | 투명 · `rgba(255,255,255,.28)` 외곽선 1px · 흰 글자 |
| 약함 | 배경·테두리 없음 · `#5A7470` 글자 | 배경·테두리 없음 · `rgba(255,255,255,.60)` 글자 |
| 비활성 | 투명 · `rgba(0,0,0,.10)` 외곽선 · `#A8B5B2` 글자 | 투명 · `rgba(255,255,255,.14)` 외곽선 · `rgba(255,255,255,.30)` 글자 |

- **채운 버튼은 한 화면에 하나.**
- **비활성은 색을 채우지 않는다.**

### 3-2. 비활성을 opacity 로 만들지 않는다

`components/photo-workspace/PhotoWorkspace.module.css` 139행

```
.primaryButton:disabled, .secondaryButton:disabled, .mutedButton:disabled { cursor: not-allowed; opacity: .46; }
```

→ 세 클래스 모두 **같은 비활성 모양**이 되도록 바꾼다.

```
.primaryButton:disabled, .secondaryButton:disabled, .mutedButton:disabled {
  cursor: not-allowed;
  background: transparent;
  border-color: rgba(255, 255, 255, .14);
  color: rgba(255, 255, 255, .30);
  opacity: 1;
}
```

이유 — 세 버튼이 **완전히 같은 조건**(`!selected.size || loading`)으로 꺼지는데, `opacity` 만 낮추니 원래 색 차이가 그대로 남아 흰색·회색·초록 세 가지로 꺼진다. 지금 화면에서는 비활성 버튼이 실행 버튼보다 더 잘 보인다.

### 3-3. 버튼 글자 뒤 화살표 제거

버튼 라벨 뒤의 `→` 를 전부 뺀다. 화살표는 **탭 이동 버튼에만** 쓴다.

### 3-4. 같은 버튼은 한 이름 · 한 자리

- `+ 새 프로젝트 만들기` → **`새 프로젝트`**
- 위치는 **우측 상단** 한 자리로. 좌측 상단에 있는 것을 옮긴다

---

## 4. 목록과 글

대상: `app/prompter/PrompterClient.tsx` 1073~1075행 주변의 프로젝트 카드 그리드.

- 카드 그리드 → **가로 리스트 행**으로. 한 행에 `이름` / `N개 씬 · N일 전 저장됨` / 우측 `>` 아이콘
- 시간은 **상대 표기**(`47일 전 저장됨`). `2026. 8. 19. 오후 12:35:33` 같은 절대 시각은 `title` 속성 툴팁으로만
- 삭제 버튼은 **행에 마우스를 올렸을 때** 우측에 나타나게
- 번호는 **원형 한 자리**. `01` `02` 두 자리 표기를 쓰지 않는다

---

## 5. 동작

**아래 다섯 가지 외에 동작을 바꾸지 않는다.**

### 5-1. 화면 순서를 가이드·코드와 맞춘다

`components/photo-workspace/AiPhotoSelectPanel.tsx`

지금 화면 순서는 `찾기 → 1 사진 폴더 선택 → 2 후보 사진` 인데, 84행 `search()` 는 `if (!query.trim() || !folder || loading) return;` 이라 **폴더가 없으면 아무 일도 하지 않는다**. 가이드 패널 순서(`1 폴더 → 2 설명 → 3 후보`)와도 반대다.

고칠 것 — 147~158행 `aiIntro` 블록(설명 문장 + 검색창 + 찾기 버튼)을 **160~166행 `폴더 선택` 섹션 아래로** 옮긴다. 결과 순서:

1. 설명 문장 (맨 위 그대로)
2. `1 사진 폴더 선택`
3. `2 원하는 사진 설명` ← 검색창 + 찾기
4. `3 후보 사진`

`aiSection h3` 의 번호 `1` `2` 를 `1` `2` `3` 으로 맞춘다.

### 5-2. 찾기가 왜 안 눌리는지 적는다

155행 찾기 버튼 아래에 한 줄을 추가한다. 조건별 문구:

| 조건 | 문구 |
|---|---|
| `!folder` | `폴더를 먼저 선택하세요.` |
| `folder && !query.trim()` | `찾을 사진을 설명해 주세요.` |
| `loading` | (문구 없음 — 진행 표시가 대신한다) |

글자 `rgba(255,255,255,.55)`, 11px.

### 5-3. 버튼 이름을 역할대로 바꾼다

187행

| 지금 | 바꿀 이름 |
|---|---|
| `선택 완료 (N장)` | `선택만 저장 (N장)` |
| `RAW 매칭으로 이동` | `저장하고 RAW 매칭으로` |

클래스도 바꾼다 — `선택만 저장` 은 **보조**(외곽선), `저장하고 RAW 매칭으로` 는 **주 실행**(민트 채움). `선택 초기화` 는 **약함**(배경 없음).

이유 — `onStartRawMatch` 가 `setSelectedJpgNames` 를 한 뒤 탭을 넘긴다. 즉 뒤가 앞을 포함하는데 이름에 드러나지 않는다.

### 5-4. 점수 배지에 이름을 붙이고, 걸러진 개수를 보여준다

178행

```
<i>{selected.has(candidate.id) ? <Check .../> : `${candidate.score}/3`}</i>
```

→ `` `관련도 ${candidate.score}` ``

그리고 `3 후보 사진` 제목 줄 우측 `{selected.size}장 선택됨` 을 다음으로 바꾼다.

```
{전체장수}장 중 관련 후보 {candidates.length}장 · {selected.size}장 선택됨
```

`전체장수` 는 126행 `.filter((candidate) => candidate.score >= 1)` **직전의 배열 길이**를 쓴다. 필터 조건 `score >= 1` 은 그대로 둔다.

이유 — 3점 만점이라는 설명이 화면 어디에도 없고, 1점 미만은 조용히 사라져서 몇 장이 걸러졌는지 알 수 없다.

### 5-5. 원격에서 못 쓰는 탭을 미리 알려준다

`components/photo-workspace/PhotoWorkspace.tsx` 72행

```
const remoteUnavailable = remote && mode !== "classification" && mode !== "select";
```

원격에서는 8개 탭 중 `사진 셀렉`·`사진 분류` 둘만 된다. 나머지 다섯(`RAW 매칭`·`T컷 정리`·`사진 보정`·`사진 리사이즈`·`이름변경`)은 **눌러야** 안 된다는 걸 알 수 있고, 그때 가이드 패널까지 같이 사라진다(133행).

고칠 것 — `PhotoWorkspaceTabs` 에 `remote` 를 넘겨서, 원격일 때 그 다섯 탭을:

- 글자·아이콘 `rgba(0,0,0,.28)`
- 라벨 뒤에 자물쇠 선 아이콘(`Lock`, size 12)
- `title` 속성: `원격 작업에서는 사용할 수 없습니다`
- **클릭은 그대로 둔다.** 눌렀을 때 안내가 나오는 동작은 유지

---

## 6. 글자 굵기

**600을 넘기지 않는다.** 본문 400 · 제목 500~600 · `<strong>` 500.

`components/photo-workspace/` 안의 `font-weight: 800`, `font-weight: 900`, `font: 800 ...`, `font: 900 ...` 를 전부 찾아 **800 → 500, 900 → 600** 으로 바꾼다.

해당 파일과 개수:

| 파일 | 개수 |
|---|---|
| `PhotoWorkspace.module.css` | 4 |
| `RemotePhotoSelectWorkspace.module.css` | 5 |
| `PhotoTcutWorkspace.module.css` | 3 |
| `RemoteJobProgress.module.css` | 3 |
| `PhotoRenameWorkspace.module.css` | 2 |
| `PhotoStudioExecutionBar.module.css` | 1 |
| `RemoteUnsupportedNotice.module.css` | 1 |

합 **19곳**. 숫자가 맞는지 확인하고, 안 맞으면 바꾸지 말고 회신한다.

---

## 7. 건드리지 말 것

- `components/AppIcon.tsx` 와 `APP_ICON_BG` — 다른 화면이 쓴다
- `app/globals.css` 의 `--ui-teal` 변수 선언 자체 — `admin` / `mailing` / `client-hub` 가 쓴다
- `app/globals.css` 7787~7788행의 `--deep-green: #162238` / `--orange: #2f4a73` — 견적서 전용 재정의다
- 가이드 패널(`PhotoGuidePanel.tsx`)의 **밝은 배경** — 사진이 아니라 글이라서 그대로 둔다
- 가이드 패널의 **9개 모드 구성** — 전부 정상이다. 지우거나 합치지 않는다
- 어두운 패널 안의 **검색 입력칸 흰 바탕** — 글자를 넣는 칸이라 그대로 둔다
- `lib/` 아래 파일 전부 — 이 작업은 `components/` 와 `app/` 의 화면 코드만 건드린다
- RAW 파일을 다루는 어떤 코드도 건드리지 않는다

---

## 8. 완료 확인

작업 끝나고 아래를 채워서 회신한다. **체크만 하지 말고 실제 값을 적는다.**

```
[ ] 1-2  PhotoTcutWorkspace.surface / PhotoRenameWorkspace.surface 배경 =
[ ] 1-3  RemotePhotoSelectWorkspace .panel 배경 =
[ ] 1-4  PhotoSortingWorkspace #103A62 남은 개수 =
[ ] 1-5  PhotoWorkspace .primaryButton 배경 =
[ ] 2-2  PhotoWorkspaceTabs 의 AppIcon 남은 개수 =
[ ] 3-2  :disabled 규칙 (그대로 붙여넣기) =
[ ] 5-1  AiPhotoSelectPanel 섹션 순서 (위에서부터) =
[ ] 5-3  버튼 세 개 이름 =
[ ] 5-4  배지 문구 =
[ ] 5-5  원격일 때 흐려지는 탭 개수 =
[ ] 6    photo-workspace 의 font-weight 800/900 남은 개수 =
[ ] 7    건드리지 말 것 중 수정된 파일 =
```

---

## 참고 · 확인 필요

현재 화면의 작업실 탭 맨 앞에 **`기획`** 이 있는데, v20 코드의 `PHOTO_WORKSPACE_TABS`(`PhotoWorkspaceTabs.tsx` 15~23행)에는 7개만 있고 `기획` 이 없다. v20 이후에 추가된 것으로 보인다. `기획` 탭에도 2장·3장 규칙을 똑같이 적용하되, **이 문서에 줄 번호가 없으므로 해당 파일을 찾으면 먼저 경로를 회신한다.**
