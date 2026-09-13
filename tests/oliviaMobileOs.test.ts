import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldUseOliviaMobileSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import { buildMobileNavigationUrl, parseMobileNavigation } from "@/lib/olivia/mobile/navigation";
import { normalizeMobileDocument, resourceReferenceFromToolResult } from "@/lib/olivia/mobile/resources";
import {
  createMobileResourceShareToken,
  MOBILE_RESOURCE_SHARE_DAYS,
  verifyMobileResourceShareToken,
} from "@/lib/olivia/mobile/resourceShares";

afterEach(() => vi.unstubAllEnvs());

describe("Olivia Mobile OS", () => {
  it("selects a separate mobile surface for supported phones without affecting desktop", () => {
    expect(shouldUseOliviaMobileSurface({ width: 390, height: 844, coarsePointer: true })).toBe(true);
    expect(shouldUseOliviaMobileSurface({ width: 1440, height: 900, coarsePointer: true })).toBe(false);
    expect(shouldUseOliviaMobileSurface({ width: 1440, height: 900, forceMobilePreview: true })).toBe(true);
  });

  it("round-trips contextual preview history while preserving unrelated parameters", () => {
    const href = buildMobileNavigationUrl("https://olivia.photoclinic.kr/?mobilePreview=1", {
      view: "preview", resourceType: "quote", resourceId: "quote-1", temporaryDocumentId: "temp-1",
    });
    expect(href).toContain("mobilePreview=1");
    expect(parseMobileNavigation(new URL(href, "https://olivia.photoclinic.kr").search)).toEqual({
      view: "preview", resourceType: "quote", resourceId: "quote-1", temporaryDocumentId: "temp-1",
    });
    expect(buildMobileNavigationUrl(`https://olivia.photoclinic.kr${href}`, { view: "chat" })).not.toContain("resourceId");
    expect(parseMobileNavigation("?mobileView=voice")).toEqual({ view: "voice" });
  });

  it("normalizes canonical document references without creating a copied resource", () => {
    expect(normalizeMobileDocument({
      id: "temporary:temp-1", type: "quote", title: "강재활 견적서", status: "pending_review",
      updatedAt: "2026-09-11T10:00:00Z", metadata: { sourceId: "quote-1", temporaryDocumentId: "temp-1" },
    })).toMatchObject({ id: "quote-1", type: "quote", temporaryDocumentId: "temp-1", statusLabel: "검토 중" });
  });

  it("extracts the same resource id from verified tool output", () => {
    expect(resourceReferenceFromToolResult("mcp_olivia_create_quote", {
      resourceId: "quote-1", hospitalName: "강재활의학과", temporaryDocumentId: "temp-1",
    })).toEqual({
      resourceType: "quote", resourceId: "quote-1", title: "강재활의학과", summary: undefined, temporaryDocumentId: "temp-1",
    });
    expect(resourceReferenceFromToolResult("calendar_create", { resourceId: "task-1" })).toBeNull();
  });

  it("creates a tamper-resistant canonical preview link that expires after seven days", () => {
    vi.stubEnv("TEMPORARY_DOCUMENT_SHARE_SECRET", "mobile-preview-test-secret");
    const now = Date.now();
    const share = createMobileResourceShareToken("quote", "quote-1", now);
    expect(new Date(share.expiresAt).getTime()).toBe(now + MOBILE_RESOURCE_SHARE_DAYS * 86_400_000);
    expect(verifyMobileResourceShareToken(share.token)).toMatchObject({ resourceType: "quote", resourceId: "quote-1" });
    expect(verifyMobileResourceShareToken(`${share.token.slice(0, -1)}x`)).toBeNull();
  });
});
