# 2026-07-05 작업 세션 요약

재부팅 전 저장 요청으로 작성. (참고: Claude Code는 대화 기록을 자체적으로도 보관하지만,
여기엔 "무엇을 왜 바꿨는지"와 "아직 해야 할 수동 작업"만 간추려 정리했다.)

## 1. 콘티생성 통합 + 손그림 스토리보드
- `촬영 콘티`(`/conti`)와 `영상 콘티`(`/video-conti`)를 `(conti-studio)` 그룹으로 묶고
  "1. 사진콘티 / 2. 영상콘티" 탭으로 전환. 헤더는 탭과 무관하게 항상 "콘티생성".
- 콘티의 손그림(현장 모드) 엔진을 `components/DrawingCanvas.tsx` 공용 컴포넌트로 분리.
- 영상콘티에 "✏️ 손그림 콘티" 모드 추가 — 그리드(2×2~3×4 프리셋 + 직접입력) 스토리보드,
  칸마다 펜/마커/형광펜/브러시 + 굵기 + 12색 + 지우개, 자동저장(2.5초 디바운스).
- 이후 개선: 레티나 화면에서 선이 깨지던 문제(DPR 미반영) 수정, 직선 대신 2차 곡선으로
  부드럽게, 지우개 전용 굵기 4단계 추가, 복원(실행취소, 최대 12단계) 추가, 손그림 콘티에
  전체 저장 버튼 추가.
- **수동 작업**: `supabase/video-conti-storyboard-schema.sql` 실행 필요 (`video_conti`
  테이블에 `storyboard_rows`/`storyboard_cols`/`storyboard_captions` 컬럼 추가).

## 2. 저장 버튼 + ⌘S 단축키 전체 적용
- 공용 훅 `lib/hooks/useSaveShortcut.ts` 생성 (⌘S/Ctrl+S 감지, 브라우저 기본 저장창 차단).
- 적용 페이지: 손그림 콘티, 영상콘티 AI 편집, 견적서(신규 "임시저장" 버튼), 계약서(아래 3번
  참고), 메일링(브랜드메일/후기요청메일), 상담메모(⌘S = AI 분석), 홈페이지 빌더, SNS 매니저.

## 3. 계약서 Supabase 저장 신규 구축
- 계약서 페이지(`/contract`)는 지금까지 저장 기능이 전혀 없었음 (메일링 큐에 자동 큐잉만 됨).
- `contracts` 테이블 신설 + `/api/contracts`, `/api/contracts/[id]` 라우트 + "저장(⌘S)" 버튼.
- **수동 작업**: `supabase/contracts-schema.sql` 실행 필요.

## 4. 견적서 미리보기 스크롤 버그 + 사이트 전체 sticky 버그 원인 발견
- 증상: 견적서 미리보기 패널이 스크롤해도 화면에 안 붙어 있음.
- 원인: `globals.css`의 페이지 진입 fade-in 애니메이션이 `<main>`에 `transform`을 영구적으로
  남겨(`fill-mode: both`) containing block이 생기고, 그 안의 `position: sticky`가 전부 깨짐.
  거기에 `html, body { overflow-x: hidden }`도 `overflow-y`를 강제로 `auto`로 만들어 sticky를
  이중으로 방해하고 있었음.
- 수정: fade-in 애니메이션 fill-mode를 `backwards`로, `overflow-x: hidden` → `overflow-x: clip`
  (스크롤 컨테이너를 만들지 않으면서 가로 넘침만 차단). **사이트 전체의 sticky 요소가 영향
  받는 수정**이라 다른 페이지도 개선됐을 가능성 있음.
- 최근 견적 표시 개수 8개 → 10개로 조정 (Supabase 저장은 이미 되고 있었음).

## 5. 상담메모 — 녹음 → 텍스트 변환 → AI 요약
- 🎙️ 녹음 시작/중지 → OpenAI Whisper로 텍스트 변환(`/api/memo/transcribe`) → 기존 AI 분석에
  자동 이어붙임.
- 캘린더의 "상담 메모" 카드가 `localStorage`에만 저장돼 다른 컴퓨터에서 안 보이던 버그 발견 →
  이미 Supabase에 저장되는 `calendar_tasks`에서 파생하도록 수정 (중복 저장 제거).

## 6. 병원이미지 진단 — 10단계 → 6단계로 축소
- 5·6·7·8번(원하는 이미지 톤/필요 콘텐츠/예산/촬영시기) 질문 제거 → 이탈률 감소 목적.
- 이후 요청으로 예산 질문만 5번으로 복귀(추천 엔진이 예산에 크게 의존하기 때문), 연락처+사진
  업로드는 6번으로. 최종: 현재상황 → 고민 → 진료과 → 사용처 → 예산 → 연락처/사진업로드(선택).
- `lib/diagnosis/questions.ts`·`types.ts`의 원본 데이터·타입은 삭제하지 않고 그대로 보존.

## 7. 메일링 개편
- 탭 순서 변경: 브랜드메일 → 임시저장 → 파일전달(리뷰) → 후기요청메일 → 셀렉갤러리.
- 브랜드메일 링크 버튼: 1개 → 여러 개 추가/삭제 가능하게 확장 (백엔드는 이미 배열 지원 중).
- "고객 메일 주소함" 신설: `/api/clients/directory`(가벼운 고객 목록 조회) + 공용 훅
  `lib/hooks/useContactDirectory.ts`로 3개 탭(브랜드메일/파일전달/후기요청)의 중복 코드를 통합.
  고객관리에 등록하면 바로 메일링 자동완성에 뜸(🏥 표시), Google 연락처(G 표시)도 같이 검색됨.
- Gmail "다른 연락처"(연락처로 저장은 안 했지만 메일 주고받은 상대) 추가 — OAuth 스코프에
  `contacts.other.readonly` 추가. **기존에 Google 연동해둔 사람은 재연동(연동 해제 후 재연결)
  해야 새 권한이 반영됨.**
- 셀렉 갤러리 "보내기" 버그 발견: 프론트엔드는 이미 `select_gallery` 타입을 쓰고 있었는데
  `mailing_queue` DB 제약에는 이 타입이 빠져 있어서 계속 조용히 실패하고 있었음.
  **수동 작업**: `supabase/mailing-queue-select-gallery-type.sql` 실행 필요.

## 8. 4K→FHD 영상 변환 도구 신규 구축
- 위치: 사진 작업실 → "🔄 4K→FHD 변환" 탭 (`/video-convert`).
- 방식: 서버 업로드 없이 브라우저에서 직접 변환 (ffmpeg.wasm, Vercel 업로드/시간 제한 회피).
- 흐름: 폴더 선택 → 화질(고화질/표준/저용량) 선택 → 파일 스캔·체크 → 변환 → 원본 폴더 안
  "FHD_변환" 폴더에 저장.
- Chrome/Edge만 지원 (File System Access API). 1.5GB 넘는 파일은 브라우저 메모리 한계로
  실패할 수 있어 경고 표시.
- Playwright로 실제 브라우저에서 엔진 로딩 + 인코딩까지 end-to-end 테스트 완료.
- 새 의존성(`@ffmpeg/ffmpeg`, `@ffmpeg/core`, `@ffmpeg/util`)과 wasm 에셋(`public/ffmpeg/`,
  약 32MB)까지 커밋·푸시 완료 — 배포에 필요한 건 전부 반영돼 있음.

## 아직 실행 안 된 Supabase 마이그레이션 (총 3개)

### 1) `supabase/video-conti-storyboard-schema.sql`
```sql
alter table public.video_conti
  add column if not exists storyboard_rows integer,
  add column if not exists storyboard_cols integer,
  add column if not exists storyboard_captions jsonb default '[]'::jsonb;
```

### 2) `supabase/contracts-schema.sql`
```sql
create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text,
  hospital_name      text not null default '',
  contact_name       text default '',
  email              text default '',
  quote_data         jsonb not null default '{}'::jsonb,
  signature_data_url text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "service role full access" on public.contracts;
create policy "service role full access" on public.contracts
  for all using (true) with check (true);
```

### 3) `supabase/mailing-queue-select-gallery-type.sql`
```sql
alter table public.mailing_queue
  drop constraint if exists mailing_queue_type_check;

alter table public.mailing_queue
  add constraint mailing_queue_type_check check (type in (
    'quote','contract','conti','proposal','original_files','gallery',
    'review_form','monthly_report',
    'per_report','per_order','per_donation',
    'portal_notification','select_gallery'
  ));
```

이 세 개를 Supabase SQL 에디터에서 순서 상관없이 실행하면, 손그림 스토리보드 저장·계약서
저장·셀렉갤러리 메일 발송이 전부 정상 동작한다.
