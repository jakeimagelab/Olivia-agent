# 포토클리닉 AI 비서 관리자

포토클리닉 내부용 통합 관리자 페이지입니다. 로그인 후 견적서 생성, 병원이미지 진단, 병원 채널 분석, 사진 전달 갤러리, 납품 리뷰 콘텐츠 정리 등 촬영 업무 기능으로 이동할 수 있습니다.

## 접속 정보

관리자 비밀번호는 코드에 저장하지 않고 `ADMIN_PASSWORD` 환경변수로 설정합니다.

## 연결된 기능

- 견적서 생성: `https://photoclinic-quote.vercel.app/photoclinic`
- 병원이미지 진단: `https://photoclinic-diangnoisis.vercel.app/`
- 병원 채널 분석: `https://channel-analysis-one.vercel.app/`
- 인스타그램 디자인: 준비 페이지
- 홈페이지 제작: 준비 페이지
- 사진 보정: Evoto 연동 검토 준비 페이지
- 촬영 갤러리: NAS 공유 링크와 카드용 대표 썸네일을 Supabase에 저장하고 Gmail로 병원에 공유
- 리뷰 콘텐츠: 납품 후 리뷰를 DB에 수집하고 인스타그램 카드뉴스/캡션 초안 생성

## 새 기능 설정

### Supabase 테이블

Supabase SQL Editor에서 아래 파일 내용을 실행합니다.

```text
supabase/photo-gallery-reviews.sql
```

생성되는 테이블:

- `photo_galleries`
- `photo_gallery_items`
- `delivery_reviews`

원본 사진은 저장하지 않습니다. NAS 공유 링크는 DB에 저장하고, 대표 이미지는 카드용 작은 썸네일로 줄여 Supabase Storage의 `gallery-thumbnails` 버킷에 저장합니다.

### 환경 변수

Vercel 또는 로컬 `.env.local`에 아래 값을 설정합니다.

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
```

`ANTHROPIC_API_KEY`가 없으면 리뷰 콘텐츠 생성은 테스트용 예시 결과로 동작합니다.

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```bash
http://localhost:3000
```

배포 전 빌드 확인:

```bash
npm run build
```

## GitHub 업로드

GitHub에서 새 저장소를 만든 뒤 프로젝트 폴더에서 아래 명령을 실행합니다.

```bash
git init
git add .
git commit -m "Initial Photo Clinic admin"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

## Vercel 배포

1. Vercel에서 `Add New Project`를 선택합니다.
2. GitHub에 올린 저장소를 선택합니다.
3. Framework Preset이 `Next.js`인지 확인합니다.
4. `ADMIN_PASSWORD`를 포함한 환경 변수를 설정합니다.
5. Deploy를 실행합니다.

## 기술 구성

- Next.js App Router
- React
- Tailwind CSS
- lucide-react
