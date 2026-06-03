# 포토클리닉 AI 비서 관리자

포토클리닉 내부용 통합 관리자 페이지입니다. 로그인 후 견적서 생성, 병원이미지 진단, 병원 채널 분석, 인스타그램 디자인, 홈페이지 제작, 사진 보정 기능으로 이동할 수 있습니다.

## 접속 정보

- 관리자 비밀번호: `Dush3928^^00`

현재 비밀번호는 테스트용으로 클라이언트 코드에 저장되어 있습니다. 실제 운영 전에는 서버 인증 또는 Vercel 환경 변수 기반 인증으로 전환하는 것을 권장합니다.

## 연결된 기능

- 견적서 생성: `https://photoclinic-quote.vercel.app/photoclinic`
- 병원이미지 진단: `https://photoclinic-diangnoisis.vercel.app/`
- 병원 채널 분석: `https://channel-analysis-one.vercel.app/`
- 인스타그램 디자인: 준비 페이지
- 홈페이지 제작: 준비 페이지
- 사진 보정: Evoto 연동 검토 준비 페이지

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
4. 별도 환경 변수 없이 배포할 수 있습니다.

## 기술 구성

- Next.js App Router
- React
- Tailwind CSS
- lucide-react
