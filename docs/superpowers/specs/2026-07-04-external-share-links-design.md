# 외부 공유 링크 생성기 설계

## 배경

포토클리닉 관리자 앱은 `ADMIN_PASSWORD` 하나로 전체 관리자 대시보드에 로그인하는 구조다. 이번에 추가하는
기능은 비밀번호를 모르는 외부인(프리랜서 협업자, 고객 등)에게 **관리자 대시보드 전체가 아니라 특정 기능
하나만** 열어줄 수 있는 링크를 관리자가 생성할 수 있게 하는 것이다.

핵심 제약: 사진분류/영상분류/AI 컷 정리 & RAW/셀렉 & 매칭 같은 기능은 브라우저의 File System Access API로
**링크를 여는 사람 본인 컴퓨터의 로컬 파일**을 다룬다. 따라서 이 링크는 스튜디오의 원본 파일을 자동으로
넘겨주는 게 아니라, 그 도구 자체(빈 화면)를 열어주는 것이다 — 링크를 받은 사람이 자신의 컴퓨터에 있는
파일로 그 도구를 사용하게 해주는 용도다 (예: 하드디스크를 받은 프리랜서 리터처).

## 공유 대상 범위

`app/page.tsx`의 `TOOLS_WORK` + `TOOLS_CONTENT` 전체와, `app/(photo-studio)/layout.tsx`의 5개 하위 탭 —
**"고객 관리"(`/clients`)와 "고객 포털 관리"(`/portal-admin`)만 제외**. 대략 20개 페이지가 공유 대상이다.

## 조사 중 발견한 기존 문제 (이번에 같이 처리)

1. **대부분의 API가 인증 체크 자체가 없음**: `/api/reviews`, `/api/daily-ideas`, `/api/brand-analysis`,
   `/api/video-classify` 등 27개 API prefix가 지금 아무 세션 체크 없이 누구나 호출 가능한 상태였다. 이번
   작업에서 공유 기능에 필요한 만큼 이 API들을 `protectedApiPrefixes`에 새로 추가한다.
2. **`middleware.ts`의 오타**: `protectedApiPrefixes`에 `/api/image-generator`가 등록되어 있지만, 실제
   `app/image-generator/page.tsx`가 호출하는 라우트는 `/api/image-director`다. 이름이 달라 보호가 전혀
   작동하지 않고 있었다 — `/api/image-director`로 수정한다.
3. **`/api/clients` 교차 의존**: `/conti`, `/mailing`, `/video-conti`, `/seo-delivery` 4개 페이지가 고객
   조회를 위해 `/api/clients`를 호출한다. "고객 관리"는 공유 대상에서 제외했으므로, 이 4개 페이지를
   외부인에게 공유했을 때 고객 조회 관련 API 호출은 의도적으로 차단한다 (해당 UI 영역은 비어 보이거나
   숨겨짐). 같은 이유로 `/photo-sorting`이 호출하는 `/api/select-galleries`(사진을 고객 전달용 갤러리로
   만들어 공유하는 기능)도 스코프에서 제외한다 — 이건 "사진 분류" 자체가 아니라 고객에게 결과물을
   전달하는 별도 업무 동작이기 때문이다. 각 페이지가 이 상황에서 에러 없이 자연스럽게 동작하는지는
   구현 후 개별 확인한다.
4. **`/api/auth` 같은 인프라성 엔드포인트**: 로그인 상태 확인(`/api/auth/check`) 같은 API는 특정 기능
   전용이 아니라 앱 전체가 공통으로 쓰는 기반 기능이라, `FEATURE_API_SCOPE`에 개별로 나열하지 않고
   지금처럼 계속 전역적으로 열어둔다 (보호 대상에 추가하지 않음).

## 아키텍처

### 데이터 모델 — `supabase/share-links-schema.sql`

```sql
create table if not exists public.share_links (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  feature_path text not null,
  label        text default '',
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  use_count    integer not null default 0
);
```

RLS는 기존 관례대로 활성화 + service role 전체 허용 정책 하나만 추가한다.

### 진입 라우트 — `app/s/[token]/route.ts`

`GET` 핸들러:
1. `token`으로 `share_links`에서 조회
2. 없거나 `revoked_at`이 있거나 `expires_at`이 지났으면 → 만료/무효 안내 페이지로 리다이렉트
   (`/s/invalid`처럼 간단한 정적 안내 페이지)
3. 유효하면 `last_used_at`/`use_count` 갱신 후, 쿠키 2개를 설정하고 `feature_path`로 307 리다이렉트:
   - `pc_share_token` (httpOnly, 실제 인증에 쓰이는 값 — 토큰 자체)
   - `pc_share_scope` (httpOnly 아님, 값은 `feature_path`만 — 클라이언트가 자기 권한 범위를 알기 위한
     용도. 이 값만으로는 아무 권한도 생기지 않고, 실제 인가는 서버의 `pc_share_token` 검증에서만
     일어난다)

### 미들웨어 확장 — `middleware.ts`

- `protectedApiPrefixes`에 이번에 발견한 미보호 API들을 추가 (필요 범위만 — 완전히 무관한 라우트까지
  넣진 않는다)
- `/api/image-generator` → `/api/image-director`로 수정
- 신규 매핑:
  ```ts
  const FEATURE_API_SCOPE: Record<string, string[]> = {
    "/memo": ["/api/memo", "/api/calendar"],
    "/calendar": ["/api/calendar", "/api/memo"],
    "/quote": ["/api/quotes", "/api/ocr-pdf"],
    "/conti": ["/api/conti", "/api/conti-chat", "/api/conti-drawing", "/api/conti-images"], // /api/clients 제외
    "/mailing": ["/api/mailing", "/api/contacts", "/api/select-galleries", "/api/send-delivery", "/api/send-brand-mail"], // /api/clients 제외
    "/report": ["/api/report"],
    "/video-conti": ["/api/video-conti", "/api/brand-analysis"], // /api/clients 제외
    "/daily-ideas": ["/api/daily-ideas"],
    "/sns-manager": ["/api/blog", "/api/naver-place", "/api/medical-ad-check"],
    "/review-studio": ["/api/reviews"],
    "/brand-analysis": ["/api/brand-analysis"],
    "/diagnosis": ["/api/submit"],
    "/channel-analyzer": [],
    "/image-generator": ["/api/image-director"],
    "/website-builder": ["/api/website-design"],
    "/seo-delivery": ["/api/seo-delivery", "/api/workflow"], // /api/clients 제외
    "/photo-sorting": ["/api/photo-scene-analyze", "/api/studio-face-analysis", "/api/studio-analysis"],
    "/video-sorting": ["/api/video-classify"],
    "/raw-select": ["/api/scene-naming"],
    "/select-match": [],
    "/photo-retouching": ["/api/color-sync", "/api/color-check"],
  };
  ```
- API 요청 처리 로직: 정식 관리자 세션(`pc_admin_session=active`)이면 기존처럼 전부 허용. 없으면
  `pc_share_token`을 조회해 유효성 확인 후, 요청 경로가 그 토큰의 `feature_path`에 매핑된
  `FEATURE_API_SCOPE` 목록에 포함되는지 확인 — 포함되면 허용, 아니면 401
- 페이지 요청 처리 로직(신규): `pc_share_token`만 있고 정식 관리자 세션이 없는 상태에서, 요청 경로가
  자신의 `feature_path`와 다르면 자신의 `feature_path`로 리다이렉트 (다른 페이지 열람 자체를 차단)
- 미들웨어에서 Supabase 조회가 필요하므로 `export const runtime = "nodejs"`로 설정 가능한지 확인 —
  안 되면 토큰 조회 결과를 짧은 시간 메모리 캐시하거나, Edge 호환 방식으로 조정한다 (구현 단계에서
  검증)

### 관리자 UI — `app/link-generator/page.tsx` + `app/api/share-links/route.ts`

- 목록(GET)·생성(POST) API는 `protectedApiPrefixes`에 포함해 정식 관리자만 호출 가능
- 페이지 구성: 공유 가능한 기능 선택(카테고리별로 묶어서 — 업무 서포트/홍보 & 분석/사진 작업실 하위
  5개), 메모 입력(선택), 만료 기간 선택(무기한/7일/30일), "링크 생성" 버튼 → 생성된 URL과 복사 버튼
  표시. 아래에 기존 링크 목록(기능명, 메모, 상태 — 활성/만료/취소, 마지막 사용 시각, 사용 횟수)과
  링크별 "취소" 버튼
- `app/page.tsx`의 `TOOLS_WORK`에 "외부 공유 링크" 카드 추가 (`href: "/link-generator"`)

### 사진작업실 레이아웃 보완 — `app/(photo-studio)/layout.tsx`

`pc_share_scope` 쿠키가 있으면(공유 세션), 상단 5개 탭 중 `pc_share_scope`와 일치하는 탭만 렌더링.
정식 관리자 세션이면 기존처럼 5개 전부 노출.

## 에러 처리

- 존재하지 않거나 만료·취소된 토큰으로 `/s/[token]` 접근 → 안내 페이지("이 링크는 더 이상 유효하지
  않습니다")
- 공유 세션으로 허용되지 않은 API 호출 → 401 (기존 관리자 미들웨어와 동일한 응답 형식)
- 공유 세션으로 허용되지 않은 페이지 접근 → 자신의 허용 페이지로 조용히 리다이렉트
- `/conti` 등 4개 페이지에서 고객 조회 API가 401을 받았을 때 페이지가 깨지지 않고 자연스럽게(빈
  드롭다운 등) 동작하는지 구현 후 4개 페이지 각각 직접 확인

## 테스트 / 검증 계획

자동화 테스트가 없는 기존 관례를 따른다. 구현 후 `/verify`로:
- 관리자 세션으로 `/link-generator`에서 임의 기능(예: 영상 분류) 링크 생성 → 무기한/기간 지정 각각 확인
- 시크릿 창(쿠키 없음)에서 생성된 링크 열기 → 해당 기능 페이지로 정상 진입, 다른 페이지 주소 직접
  입력 시 자기 페이지로 리다이렉트되는지 확인
- 그 공유 세션 상태로 허용된 API는 성공, 범위 밖 API(예: `/api/clients`)는 401인지 확인
- 링크 취소 후 같은 링크로 재접근 시 무효 안내로 가는지 확인
- `/conti`, `/mailing`, `/video-conti`, `/seo-delivery` 공유 시 고객 조회 UI가 에러 없이 비어 보이는지
  개별 확인
- 사진작업실 공유 시 탭이 1개만 보이는지 확인
