# 포토클리닉 구독 콘텐츠 운영

포토클리닉의 촬영 자산을 병원의 월간 홍보 콘텐츠로 전환하기 위한 내부 운영 시스템입니다.

핵심 서비스명은 **월간 포토클리닉**이며, 병원이 월 50만원 구독으로 매달 SNS, 블로그, 네이버 플레이스, 홈페이지, 릴스 썸네일, 카드뉴스 콘텐츠를 받을 수 있도록 운영합니다.

## 핵심 메뉴

- 월간 포토클리닉
- 병원 구독 관리
- 콘텐츠 자산 보관함
- 월간 콘텐츠 캘린더
- SNS 디자인 생성
- 블로그/플레이스 콘텐츠 생성
- 채널 진단 리포트
- 월간 운영 리포트

기존 촬영 업무인 견적서, 병원이미지 진단, 촬영 콘티, 파일 전송, 홈페이지 제작, 사진 분류, AI 이미지 생성 기능은 보조 메뉴로 유지합니다.

## 인증

관리자 로그인은 서버 API와 httpOnly 쿠키를 사용합니다.

- `POST /api/login`
- `POST /api/logout`
- `GET /api/auth/check`

클라이언트 코드에 관리자 비밀번호를 하드코딩하지 않습니다.

## 환경변수

Vercel 또는 `.env.local`에 아래 값을 설정합니다.

```bash
ADMIN_PASSWORD=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

GMAIL_USER=
GMAIL_APP_PASSWORD=
GMAIL_FROM_NAME=포토클리닉

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

RESEND_API_KEY=
```

## Supabase

Supabase SQL Editor에서 아래 파일을 실행합니다.

```text
supabase/monthly-photoclinic.sql
```

생성되는 주요 테이블:

- `hospitals`
- `subscriptions`
- `content_assets`
- `content_calendar`
- `content_items`
- `channel_audits`
- `monthly_reports`

기존 갤러리/리뷰 기능을 함께 사용할 경우 아래 파일도 실행합니다.

```text
supabase/photo-gallery-reviews.sql
```

## 보호된 내부 API

아래 API는 관리자 쿠키가 없으면 401을 반환합니다.

- `/api/olivia`
- `/api/send-delivery`
- `/api/send-contract`
- `/api/image-generator`
- `/api/variation`
- `/api/conti`
- `/api/website-design`
- `/api/report`
- `/api/ocr-pdf`

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3000
```

## Vercel 배포

1. GitHub 저장소에 업로드합니다.
2. Vercel에서 `Add New Project`를 선택합니다.
3. Framework Preset은 `Next.js`로 둡니다.
4. 환경변수를 입력합니다.
5. Deploy를 실행합니다.

## 기술 구성

- Next.js App Router
- React
- Supabase
- Gmail SMTP
- Anthropic API
- lucide-react
