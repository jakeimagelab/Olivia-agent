export const dynamic = "force-dynamic";

// 구버전 EventSource의 자동 재연결을 멈춘다. 대화 GET은 짧은 visible polling으로 호출한다.
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Olivia-Realtime": "visible-polling" },
  });
}
