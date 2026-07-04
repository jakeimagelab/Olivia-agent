# 콘티생성 통합 + 손그림 스토리보드 그리드 설계

## 배경

현재 대시보드에 "촬영 콘티 생성"(`/conti`)과 "영상 콘티 생성"(`/video-conti`)이 별개 도구 카드로 있다.
둘은 데이터 모델이 완전히 다르다:

- `/conti`: 병원 촬영 당일 계획 도구. 콘티 표 + 체크리스트 + 타임테이블을 OpenAI로 생성. 이미 자체
  손그림 기능(현장 모드)을 HTML5 canvas로 구현해뒀다 — 펜/마커/형광펜/붓 4종, 12색 팔레트, 지우개,
  터치+마우스, Supabase 저장까지 전부 있음 (`app/conti/page.tsx` 697~897행).
- `/video-conti`: 브랜드 홈페이지 분석 + BGM 분석을 바탕으로 Claude가 영상 씬·컷 목록을 생성하는
  4단계 마법사.

두 기능을 하나의 "콘티생성" 아래 탭으로 묶고, 영상콘티 쪽에 실제 스토리보드처럼 여러 칸으로 나눠
손으로 그릴 수 있는 그리드 보드를 추가한다.

## 범위

- 데이터 모델은 합치지 않는다 (완전히 다른 스키마, 억지로 합치면 위험). 대신 하나의 앱 안에서
  탭으로 전환하는 방식.
- `/conti`, `/video-conti` 라우트 자체와 기존 공유 뷰 링크(`/conti/view/[token]`,
  `/video-conti/view/[token]`)는 그대로 유지 — URL을 바꾸지 않는다.
- 그리드 손그림 보드는 AI가 생성한 컷(Cut) 개수와 무관한 독립 도구다. 사용자가 직접 행/열을
  정해서 자유롭게 스케치하는 용도이며, AI 생성 씬/컷 데이터와 연결되지 않는다.

## 아키텍처

### 1. 탭 통합 — `app/(conti-studio)/layout.tsx` (신규)

`app/(photo-studio)/layout.tsx`와 동일한 구조로 작성한다: 상단에 유리질감 탭 바
("📋 사진콘티" → `/conti`, "🎬 영상콘티" → `/video-conti`), `PageHeader` 재사용, 현재 경로에 따라
활성 탭 표시. `app/conti/page.tsx`와 `app/video-conti/page.tsx`는 이 레이아웃 아래로 이동하되
파일 내용/로직은 건드리지 않는다.

`app/page.tsx`의 `TOOLS_WORK`에서 "촬영 콘티 생성"(`/conti`)과 "영상 콘티 생성"(`/video-conti`)
카드 2개를 제거하고, "콘티생성" 카드 1개(`href: "/conti"`)로 교체한다.

### 2. 손그림 엔진 공유 컴포넌트 — `components/DrawingCanvas.tsx` (신규)

`app/conti/page.tsx`의 그리기 로직(펜 종류별 스타일 적용, 속도 기반 붓 두께, 지우개, 캔버스
리사이즈/저장/복원)을 하나의 재사용 컴포넌트로 뽑아낸다.

```typescript
type PenType = "pen" | "marker" | "highlighter" | "brush" | "eraser";

interface DrawingCanvasProps {
  width: number;
  height: number;
  penType: PenType;
  penSize: number;
  penColor: string;
  initialImage?: string;       // 복원용 base64 PNG
  onChange?: (dataUrl: string) => void;  // 디바운스된 변경 콜백 (자동저장용)
}
```

`app/conti/page.tsx`의 기존 현장 모드 그리기는 이 컴포넌트를 사용하도록 교체한다 (동작은 동일하게
유지 — 시각적 회귀 없는지 확인 필요). 영상콘티의 그리드 보드도 같은 컴포넌트를 칸마다 하나씩
인스턴스화해서 쓴다.

### 3. 그리드 스토리보드 보드 — `app/video-conti/page.tsx` 내 신규 모드

영상콘티 페이지 최상단에 세그먼트 토글 추가: **"AI 콘티 생성"**(기존 Step1~4 마법사, 기본값) /
**"손그림 콘티"**(신규).

손그림 콘티 모드 UI:
- 그리드 크기 선택: 프리셋 버튼(2×2, 2×3, 3×3, 3×4) + 직접 입력(행/열 숫자, 각 1~6 제한)
- 그리드 크기를 바꾸면 기존 칸 내용이 사라질 수 있다는 확인창 표시 후 적용
- 각 칸: `DrawingCanvas` 인스턴스 + 칸 아래 한 줄짜리 메모 입력(예: "오프닝 로고 등장", 최대 60자)
- 화면 상단에 고정된 펜 툴바: 펜 종류(펜/마커/형광펜/붓) 선택, 두께 슬라이더, 12색 팔레트,
  지우개 버튼 — 현재 클릭/터치 중인 칸에 적용됨 (칸을 클릭하면 해당 칸이 "활성 칸"이 되고
  테두리로 표시)
- 자동저장: 칸 그림이 바뀌면 2.5초 디바운스 후 해당 칸만 저장 (기존 conti-drawing과 동일한
  디바운스 시간)

### 4. 데이터 모델 및 API

`video_conti` 테이블에 컬럼 추가:
```sql
alter table public.video_conti
  add column if not exists storyboard_rows integer,
  add column if not exists storyboard_cols integer,
  add column if not exists storyboard_captions jsonb default '[]'::jsonb;
```

칸 이미지는 Supabase Storage에 `video-conti-drawings/{videoContiId}/panel-{index}.png`로 저장
(기존 `/api/conti-drawing`이 쓰는 버킷/경로 관례를 그대로 따름).

새 API 라우트 `app/api/video-conti/[id]/drawing/route.ts`:
- `GET`: 그리드 크기, 칸별 메모, 칸별 이미지 URL 반환
- `POST`: `{ panelIndex, imageBase64, caption }` 저장 — 이미지가 있으면 Storage에 업로드하고 URL
  갱신, 메모는 `storyboard_captions` 배열의 해당 인덱스만 갱신
- `PUT`: 그리드 크기 변경 (`{ rows, cols }`) — 크기가 줄어들면 범위 밖 칸의 이미지/메모는 버림

## 에러 처리

- 그리드 크기 변경 시 기존 칸 내용 손실 경고(확인 다이얼로그) — 취소하면 크기 변경 안 함
- 칸 이미지 저장 실패 시 조용히 재시도 1회 후 실패하면 해당 칸에 작은 경고 아이콘 표시(다른 칸
  작업은 막지 않음)
- `DrawingCanvas`로 리팩터링한 뒤 기존 `/conti` 현장 모드 그리기가 그대로 동작하는지 회귀 확인
  필수 (펜 종류별 스타일, 지우개, 저장/복원)

## 테스트 / 검증 계획

- 타입체크
- 브라우저: `/conti`, `/video-conti` 탭 전환 확인, 기존 현장 모드 그리기 회귀 없는지 확인
- 영상콘티 손그림 모드: 그리드 크기 변경(프리셋+커스텀), 칸별 펜/색/두께/지우개 동작, 자동저장
  디바운스 확인
- 대시보드에 "콘티생성" 카드 하나로 잘 합쳐졌는지, 클릭 시 `/conti`로 이동하는지 확인
- 기존 공유 뷰 링크(`/conti/view/[token]`, `/video-conti/view/[token]`)가 레이아웃 변경 후에도
  정상 동작하는지 확인 (이 라우트들은 `(conti-studio)` 레이아웃 밖에 있어야 함 — 아래 참고)

**주의**: `/conti/view/[token]`과 `/video-conti/view/[token]`은 고객에게 공유되는 공개 페이지라
관리자용 탭 헤더가 보이면 안 된다. `(conti-studio)` 레이아웃 그룹에는 `/conti`, `/video-conti`의
메인 페이지만 넣고, `view/[token]` 하위 라우트는 이 레이아웃 그룹 밖에 그대로 둔다 (지금 위치
유지, 변경 없음).
