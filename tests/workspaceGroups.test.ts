import { describe, expect, it } from "vitest";
import { resolvePhotoWorkspaceToolState } from "@/components/photo-workspace/photoWorkspaceToolState";
import { resolveFeatureIntent } from "@/lib/olivia/features/resolver";
import { ALL_TOOLS } from "@/lib/toolNav";
import {
  WORKSPACE_GROUPS,
  getCanonicalWorkspaceHref,
  isIntegratedToolHref,
} from "@/lib/workspaceGroups";

describe("integrated workspace registry", () => {
  it("exposes the five approved primary workspaces in order", () => {
    expect(WORKSPACE_GROUPS.map((group) => group.title)).toEqual([
      "사진작업실",
      "콘티 스튜디오",
      "브랜드 진단센터",
      "콘텐츠 스튜디오",
      "리포트 · 인사이트",
    ]);
  });

  it("removes grouped tools from the standalone launcher without deleting ALL_TOOLS", () => {
    expect(isIntegratedToolHref("/select-match")).toBe(true);
    expect(isIntegratedToolHref("/metadata-select")).toBe(true);
    expect(isIntegratedToolHref("/calendar")).toBe(false);
    expect(ALL_TOOLS.some((tool) => tool.href === "/select-match")).toBe(true);
    expect(ALL_TOOLS.some((tool) => tool.href === "/calendar")).toBe(true);
  });

  it("normalizes legacy photo routes and preserves their context query", () => {
    expect(getCanonicalWorkspaceHref("/select-match?clientId=client-1")).toBe(
      "/photo-sorting?tool=select-raw&clientId=client-1",
    );
    expect(getCanonicalWorkspaceHref("/metadata-select")).toBe("/photo-sorting?tool=metadata-match");
    expect(getCanonicalWorkspaceHref("/photo-retouching")).toBe("/photo-sorting?tool=retouch");
  });
});

describe("photo workspace tool deep links", () => {
  it("selects integrated photo modes directly", () => {
    expect(resolvePhotoWorkspaceToolState("ai-search")).toMatchObject({ mode: "select", selectMode: "ai" });
    expect(resolvePhotoWorkspaceToolState("classification")).toMatchObject({ mode: "classification" });
    expect(resolvePhotoWorkspaceToolState("conversion")).toMatchObject({ mode: "conversion" });
    expect(resolvePhotoWorkspaceToolState("retouch")).toMatchObject({ mode: "select", selectMode: "manual" });
  });

  it("keeps metadata matching and AI culling inside the photo workspace shell", () => {
    expect(resolvePhotoWorkspaceToolState("metadata-match")).toMatchObject({ mode: "select", selectMode: "client" });
    expect(resolvePhotoWorkspaceToolState("ai-cull")).toMatchObject({ mode: "select", selectMode: "manual" });
  });
});

describe("Olivia resolves detailed feature names through the workspace registry", () => {
  const cases: Array<[string, string]> = [
    ["메타데이터 셀렉", "/photo-sorting?tool=metadata-match"],
    ["유튜브 편집 콘티", "/youtube-editing-conti"],
    ["병원 채널 분석", "/channel-analyzer"],
    ["리뷰 콘텐츠", "/review-studio"],
  ];

  for (const [query, href] of cases) {
    it(`${query} → ${href}`, () => {
      const result = resolveFeatureIntent(query);
      expect(result.kind).toBe("match");
      if (result.kind === "match") {
        expect(result.confidence).toBe(1);
        expect(result.tool.href).toBe(href);
      }
    });
  }
});
