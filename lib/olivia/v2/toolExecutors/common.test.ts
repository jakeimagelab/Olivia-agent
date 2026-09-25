import { describe, expect, it } from "vitest";
import { activeResource, normalizeWorkspaceResourceId } from "./common";
import type { OliviaContextSnapshot } from "../types";

const emptyContext: OliviaContextSnapshot = { recentActions: [], revision: 0 };

describe("workspace resource ids", () => {
  it("unwraps a matching document-search id", () => {
    expect(normalizeWorkspaceResourceId("quote:quote-id", "quote")).toBe("quote-id");
    expect(normalizeWorkspaceResourceId("storyboard:conti-id", "conti")).toBe("conti-id");
  });

  it("does not unwrap a mismatched document type", () => {
    expect(normalizeWorkspaceResourceId("contract:contract-id", "quote")).toBe("contract:contract-id");
  });

  it("uses a searched quote as the active quote without passing the composite id to the database", () => {
    expect(activeResource({
      ...emptyContext,
      currentDocumentType: "quote",
      currentDocumentId: "quote:quote-id",
    }, "quote")).toBe("quote-id");
  });

  it("accepts storyboard as the document-search alias for the conti workspace", () => {
    expect(activeResource({
      ...emptyContext,
      currentDocumentType: "storyboard",
      currentDocumentId: "storyboard:conti-id",
    }, "conti")).toBe("conti-id");
  });
});
