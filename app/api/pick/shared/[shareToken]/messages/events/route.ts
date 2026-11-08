export const dynamic = "force-dynamic";

// 공개 공유 링크의 구버전 EventSource도 204로 종료해 자동 재연결을 멈춘다.
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Olivia-Realtime": "visible-polling" },
  });
}
