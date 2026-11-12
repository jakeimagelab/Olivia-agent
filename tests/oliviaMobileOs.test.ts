import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldUseOliviaMobileSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import {
  buildMobileNavigationUrl,
  parseMobileNavigation,
  primaryViewForNavigation,
  resolveMobileStartupNavigation,
} from "@/lib/olivia/mobile/navigation";
import { auditMobileCapabilityCoverage, mobileCapabilityFor, visibleMobileCapabilities } from "@/lib/olivia/mobile/appCapabilities";
import { normalizeMobileDocument, resourceReferenceFromToolResult } from "@/lib/olivia/mobile/resources";
import { oliviaAppRegistry } from "@/components/olivia-os/registry/oliviaAppRegistry";
import { MOBILE_BRIDGE_STAGES, mobileBridgeStageState, safeBridgeDisplayPath } from "@/components/olivia-mobile/MobileBridgeStatus";
import {
  createMobileResourceShareToken,
  MOBILE_RESOURCE_SHARE_DAYS,
  verifyMobileResourceShareToken,
} from "@/lib/olivia/mobile/resourceShares";

afterEach(() => vi.unstubAllEnvs());

describe("Olivia Mobile OS", () => {
  it("starts normal launches at home and keeps explicit customer launches", () => {
    expect(resolveMobileStartupNavigation(null)).toEqual({ view: "home" });
    expect(resolveMobileStartupNavigation({ appId: "customer", clientId: "client-a" }))
      .toEqual({ view: "clients", targetId: "client-a" });
  });

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
    expect(parseMobileNavigation("?mobileView=photo-workspace")).toEqual({ view: "photo-workspace" });
    expect(buildMobileNavigationUrl("https://olivia.photoclinic.kr/", { view: "photo-workspace" }))
      .toContain("mobileView=photo-workspace");
    expect(parseMobileNavigation("?mobileView=photo-pending")).toEqual({ view: "photo-pending" });
    expect(primaryViewForNavigation({ view: "photo-pending" })).toBe("home");
  });

  it("persists an explicitly selected mobile target and clears it on a general app launch", () => {
    const eventHref = buildMobileNavigationUrl("https://olivia.photoclinic.kr/?mobilePreview=1", {
      view: "person-select", targetId: "event-22",
    });
    expect(parseMobileNavigation(new URL(eventHref, "https://olivia.photoclinic.kr").search))
      .toEqual({ view: "person-select", targetId: "event-22" });
    const generalHref = buildMobileNavigationUrl(`https://olivia.photoclinic.kr${eventHref}`, { view: "person-select" });
    expect(generalHref).not.toContain("mobileTargetId");
    expect(parseMobileNavigation(new URL(generalHref, "https://olivia.photoclinic.kr").search))
      .toEqual({ view: "person-select" });
  });

  it("keeps an explicitly selected shooting run with its client and clears it on a general client launch", () => {
    const detailHref = buildMobileNavigationUrl("https://olivia.photoclinic.kr/?mobilePreview=1", {
      view: "clients", targetId: "client-a", workflowRunId: "run-a",
    });
    expect(parseMobileNavigation(new URL(detailHref, "https://olivia.photoclinic.kr").search)).toEqual({
      view: "clients", targetId: "client-a", workflowRunId: "run-a",
    });
    const listHref = buildMobileNavigationUrl(`https://olivia.photoclinic.kr${detailHref}`, { view: "clients" });
    expect(listHref).not.toContain("mobileWorkflowRunId");
    expect(listHref).not.toContain("mobileTargetId");
  });

  it("centralizes mobile capabilities instead of mounting desktop editors", () => {
    expect(mobileCapabilityFor("customer")?.modes).toEqual(["manage", "full"]);
    expect(mobileCapabilityFor("person-select")?.mobileView).toBe("person-select");
    expect(mobileCapabilityFor("quote")?.modes).toEqual(["viewer", "request"]);
    expect(mobileCapabilityFor("olivia-bridge")?.modes).toEqual(["status", "request"]);
    expect(mobileCapabilityFor("prompter")?.modes).toEqual(["full"]);
    expect(mobileCapabilityFor("legacy-route")?.modes).toEqual(["desktop-only"]);
    expect(new Set(visibleMobileCapabilities().map((item) => item.appId)).size)
      .toBe(visibleMobileCapabilities().length);
    expect(auditMobileCapabilityCoverage(oliviaAppRegistry.map((app) => app.id))).toEqual({ missing: [], unknown: [] });
  });

  it("derives Bridge stage state from real jobs and marks unsupported stages honestly", () => {
    const jobs = [
      { action: "PHOTO_SORT", status: "COMPLETED" },
      { action: "PHOTO_RAW_MATCH", status: "RUNNING" },
      { action: "PHOTO_RETOUCH", status: "FAILED" },
    ];
    expect(mobileBridgeStageState(MOBILE_BRIDGE_STAGES[0], jobs)).toBe("done");
    expect(mobileBridgeStageState(MOBILE_BRIDGE_STAGES[2], jobs)).toBe("running");
    expect(mobileBridgeStageState(MOBILE_BRIDGE_STAGES[6], jobs)).toBe("failed");
    expect(mobileBridgeStageState(MOBILE_BRIDGE_STAGES[3], jobs)).toBe("unsupported");
    expect(safeBridgeDisplayPath("/Volumes/Agentstation(M.2SSD)/촬영/병원A")).toBe("Agentstation(M.2SSD)/촬영/병원A");
    expect(safeBridgeDisplayPath("/Users/jakemacstudio/UGnasync/촬영A")).toBe("UGnasync/촬영A");
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
