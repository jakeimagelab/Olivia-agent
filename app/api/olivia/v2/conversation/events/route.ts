export const dynamic = "force-dynamic";

// 구버전 브라우저가 이 SSE 주소를 계속 재연결하지 않도록 204로 종료한다.
// 실시간 동기화는 보이는 채팅에서만 짧게 끝나는 GET polling으로 처리한다.
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Olivia-Realtime": "visible-polling" },
  });
}
