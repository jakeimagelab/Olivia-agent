// 서버 라우트/도구 실행기에서 자기 자신을 self-fetch할 때 쓰는 절대 URL. 우선순위:
// 명시적으로 설정한 NEXT_PUBLIC_BASE_URL → Vercel이 배포마다 채워주는 VERCEL_URL → 로컬 dev.
export function resolveServerBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
    || "http://127.0.0.1:3000";
}
