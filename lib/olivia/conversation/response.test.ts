import { describe, expect, it } from "vitest";
import { renderOliviaOutcome, renderVerifiedToolRound, toolResultOutcome } from "./response";

describe("Olivia natural response renderer", () => {
  it("검증된 목표 총액을 짧게 말한다", () => {
    const outcome = toolResultOutcome({
      tool: "apply_quote_rebalance", success: true,
      data: { summary: "375,000원 할인을 적용했어요.", totalAmount: 2_300_000 },
      verification: { executed: true, persisted: true, details: { totalAmount: 2_300_000 } },
    }, {
      id: "a", status: "pending", intent: "apply_quote_rebalance", toolName: "apply_quote_rebalance", toolInput: {},
      target: { title: "리나클리닉" }, prompt: "적용할까요?", createdAt: "2026-09-11T00:00:00.000Z",
    });
    expect(renderOliviaOutcome(outcome)).toBe("됐어요. 리나클리닉 건을 2,300,000원으로 맞췄어요.");
  });

  it("실패 시 기존 상태가 유지됐음을 자연스럽게 알린다", () => {
    const text = renderOliviaOutcome(toolResultOutcome({ tool: "publish_quote", success: false, error: "저장하지 못했어요.", verification: { executed: true, persisted: false } }));
    expect(text).toBe("저장하지 못했어요. 기존 내용은 그대로예요. 다시 해볼까요?");
  });

  it("보류와 거절을 내부 용어 없이 답한다", () => {
    expect(renderOliviaOutcome({ status: "deferred", targetTitle: "리나클리닉" })).toBe("알겠어요. 리나클리닉 건은 그대로 보관할게요.");
    expect(renderOliviaOutcome({ status: "rejected" })).not.toMatch(/tool|DB|pending/i);
  });

  it("일반 mutation도 검증된 summary만 한 번 전달한다", () => {
    expect(renderVerifiedToolRound([
      { result: { tool: "calendar_add", success: true, data: { summary: "내일 오후 2시 일정을 추가했어요." }, verification: { executed: true, persisted: true } } },
    ])).toBe("내일 오후 2시 일정을 추가했어요.");
    expect(renderVerifiedToolRound([{ result: { tool: "calendar_list", success: true, data: { items: [] } } }])).toBeNull();
  });
});
