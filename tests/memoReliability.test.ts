import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table !== "consultation_memos") throw new Error(`unexpected table: ${table}`);
      return {
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "insert denied" } }) }) }),
      };
    },
  }),
}));

vi.mock("@/lib/olivia/nameSearch", () => ({
  fuzzyNameSearch: vi.fn(async () => [{ id: "client-1", hospital_name: "강재활의학과" }]),
}));

vi.mock("@/lib/channelAnalysis", () => ({ analyzeChannels: vi.fn() }));
vi.mock("@/lib/olivia/chatWorkTools", () => ({ executeOliviaChatWorkTool: vi.fn(), OLIVIA_CHAT_WORK_TOOL_NAMES: new Set() }));

import { executeClientTool } from "@/lib/olivia/v2/toolExecutors/client";

describe("Memo reliable persistence", () => {
  it("insert error를 persisted success로 보고하지 않는다", async () => {
    await expect(executeClientTool("memo_add", { clientName: "강재활의학과", content: "금요일 통화" }, { recentActions: [], revision: 0 }))
      .rejects.toThrow("insert denied");
  });
});
