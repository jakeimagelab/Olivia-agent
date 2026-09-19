import { HermesChatError, runHermesChat } from "@/lib/hermes/client";
import type { BrainChatInput, BrainChatResult, OliviaBrain } from "./types";
import { BrainUnavailableError } from "./types";

// lib/hermes/client.ts의 runHermesChat()을 감싸기만 한다 — Hermes 호출·SSE 파싱·tool audit
// 반영 로직(약 250줄)은 이미 완성돼 있고 실제 운영 트래픽을 받고 있어(요청서 §1 "전체 재작성 금지")
// 다시 구현하지 않는다. 이 파일의 유일한 역할은 그 결과를 OliviaBrain 계약(BrainChatResult) 모양으로
// 맞추는 것뿐이다.
export const hermesProvider: OliviaBrain = {
  engine: "hermes",
  async chat(input: BrainChatInput): Promise<BrainChatResult> {
    try {
      const result = await runHermesChat({
        message: input.message,
        history: input.history,
        conversationId: input.conversationId,
        context: input.context,
        signal: input.signal,
        callbacks: input.callbacks,
        selectedToolNames: input.selectedToolNames,
      });
      return { type: "message", text: result.message, runId: result.runId, toolCalls: result.toolCalls };
    } catch (error) {
      if (error instanceof HermesChatError) throw new BrainUnavailableError(error.message, error.fallbackSafe);
      throw error;
    }
  },
};
