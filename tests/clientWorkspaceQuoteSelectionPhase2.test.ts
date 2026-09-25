import { describe, expect, it } from "vitest";
import { selectWorkspaceQuote } from "@/lib/clientWorkspace/quoteSelection";

describe("client workspace quote selection", () => {
  it("prefers the newest approved quote over a newer draft", () => {
    expect(selectWorkspaceQuote(
      { id: "approved-quote", status: "published" },
      { id: "newer-draft", status: "draft" },
    )).toEqual({
      quote: { id: "approved-quote", status: "published" },
      meta: { status: "published", isApproved: true },
    });
  });

  it("falls back to the newest draft and marks it as unapproved", () => {
    expect(selectWorkspaceQuote(null, { id: "draft-quote", status: "draft" })).toEqual({
      quote: { id: "draft-quote", status: "draft" },
      meta: { status: "draft", isApproved: false },
    });
  });

  it("returns empty metadata when the project has no quote", () => {
    expect(selectWorkspaceQuote(null, null)).toEqual({ quote: null, meta: null });
  });
});
