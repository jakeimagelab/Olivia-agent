import { NextRequest } from "next/server";
import {
  anthropicClient,
  buildOliviaModelRequest,
  buildOliviaResponsePayload,
  processOliviaRequest,
} from "@/lib/assistant/core/legacyOliviaCore";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// 홈 히어로챗/플로팅 위젯 전용 SSE 스트리밍 경로 — 기존 /api/olivia(텔레그램·카카오도
// 공유하는 단일 JSON 응답 계약)는 그대로 두고, 웹 채팅만 여기서 토큰 단위로 먼저 보여준다.
// 요청 파싱·시스템 프롬프트·도구 목록은 legacyOliviaCore의 buildOliviaModelRequest를 그대로
// 재사용해서 두 경로의 동작이 어긋나지 않게 한다.
export async function POST(req: NextRequest) {
  const body = await req.json();

  // 도구 실행(pendingTool)은 LLM 생성이 없어 스트리밍 이점이 없다 — 기존 비스트리밍 경로를
  // 그대로 위임해서 로직을 중복하지 않는다.
  if (body.pendingTool) {
    return processOliviaRequest(body, req);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const encoder = new TextEncoder();
  let anthropicStream: ReturnType<typeof anthropicClient.messages.stream> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sseEvent(event, data)));
        } catch {
          // 클라이언트가 이미 연결을 끊은 뒤 enqueue 시도 — 무시
        }
      };

      if (!apiKey) {
        send("error", { error: "ANTHROPIC_API_KEY 미설정" });
        controller.close();
        return;
      }

      try {
        const params = await buildOliviaModelRequest(body);
        anthropicStream = anthropicClient.messages.stream(params);
        anthropicStream.on("text", (delta) => send("text_delta", { delta }));
        const finalMessage = await anthropicStream.finalMessage();
        send("done", buildOliviaResponsePayload(finalMessage));
      } catch (e: any) {
        if (e?.name !== "APIUserAbortError") {
          send("error", { error: e?.message ?? "스트리밍 중 오류가 발생했어요." });
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      // 사용자가 정지 버튼을 눌러 fetch를 abort하면 여기로 들어온다 — 남은 토큰 생성 비용을
      // 아끼기 위해 Anthropic 쪽 스트림도 같이 끊는다.
      anthropicStream?.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
