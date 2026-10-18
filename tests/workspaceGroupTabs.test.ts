import { describe, expect, it } from "vitest";
import { resolveFavoriteWorkspaceTools } from "@/components/olivia-os/apps/all-apps/AllAppsWindowContent";
import {
  getCanonicalWorkspaceHref,
  resolveWorkspaceGroupForLocation,
} from "@/lib/workspaceGroups";

describe("workspace group entry tabs", () => {
  const cases: Array<[string, string | undefined, string, string]> = [
    ["/ai-trust-gap", undefined, "brand", "ai-search"],
    ["/channel-analyzer", undefined, "brand", "channel"],
    ["/trend-dashboard", undefined, "brand", "trend"],
    ["/trend-dashboard", "group=insights", "insights", "trend"],
    ["/review-studio", undefined, "content", "review"],
    ["/clients/reviews", undefined, "content", "review"],
    ["/monthly-report", undefined, "insights", "monthly"],
  ];

  for (const [pathname, search, groupId, toolId] of cases) {
    it(`${pathname}${search ? `?${search}` : ""} resolves to ${groupId}/${toolId}`, () => {
      const resolved = resolveWorkspaceGroupForLocation(pathname, search);
      expect(resolved?.group.id).toBe(groupId);
      expect(resolved?.activeToolId).toBe(toolId);
    });
  }

  it("does not add a second group tab row to photo or video workspaces", () => {
    expect(resolveWorkspaceGroupForLocation("/photo-sorting")).toBeNull();
    expect(resolveWorkspaceGroupForLocation("/video-studio")).toBeNull();
  });

  it("keeps the existing trend dashboard canonical href", () => {
    expect(getCanonicalWorkspaceHref("/trend-dashboard")).toBe("/trend-dashboard");
    expect(getCanonicalWorkspaceHref("/trend-dashboard?group=insights")).toBe("/trend-dashboard?group=insights");
  });

  it("restores hidden standalone tools from saved favorites", () => {
    const favorites = resolveFavoriteWorkspaceTools(["/ai-trust-gap", "/review-studio"]);
    expect(favorites).toHaveLength(2);
    expect(favorites.map((tool) => tool.href)).toEqual(["/ai-trust-gap", "/review-studio"]);
  });
});
