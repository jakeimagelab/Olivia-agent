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
  it("exposes the approved primary workspaces in order", () => {
    expect(WORKSPACE_GROUPS.map((group) => group.title)).toEqual([
      "사진작업실",
      "영상작업실",
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
      "/photo-sorting?mode=raw-match&clientId=client-1",
    );
    expect(getCanonicalWorkspaceHref("/metadata-select")).toBe("/photo-sorting?tool=metadata-match");
    expect(getCanonicalWorkspaceHref("/photo-retouching")).toBe("/photo-sorting?tool=retouch");
  });

  it("moves video sorting out of the photo workspace into 영상작업실", () => {
    expect(isIntegratedToolHref("/video-sorting")).toBe(true);
    expect(getCanonicalWorkspaceHref("/video-sorting")).toBe("/video-studio?tab=post&tool=sorting");
  });

  it("maps former standalone production tools to their exact workspace tabs", () => {
    expect(getCanonicalWorkspaceHref("/conti?clientId=c1")).toBe("/photo-sorting?tab=plan&tool=conti&clientId=c1");
    expect(getCanonicalWorkspaceHref("/video-conti")).toBe("/video-studio?tab=plan&tool=video-conti");
    expect(getCanonicalWorkspaceHref("/youtube-editing-conti")).toBe("/video-studio?tab=plan&tool=youtube-conti");
    expect(getCanonicalWorkspaceHref("/broll-prompt")).toBe("/video-studio?tab=plan&tool=broll");
    expect(getCanonicalWorkspaceHref("/prompter")).toBe("/video-studio?tab=shoot&tool=prompter");
    expect(getCanonicalWorkspaceHref("/video-production")).toBe("/video-studio?tab=publish&tool=ai-video");
    expect(getCanonicalWorkspaceHref("/portrait-consent")).toBe("/clients?tab=documents&document=portrait-consent");
  });
});

describe("photo workspace tool deep links", () => {
  it("selects integrated photo modes directly", () => {
    expect(resolvePhotoWorkspaceToolState("ai-search")).toMatchObject({ mode: "select", selectMode: "ai" });
    expect(resolvePhotoWorkspaceToolState("classification")).toMatchObject({ mode: "classification" });
    expect(resolvePhotoWorkspaceToolState("rename")).toMatchObject({ mode: "rename" });
    expect(resolvePhotoWorkspaceToolState("conversion")).toBeUndefined();
    expect(resolvePhotoWorkspaceToolState("retouch")).toMatchObject({ mode: "retouch", selectMode: "manual" });
  });

  it("keeps metadata matching and T컷 cleanup inside the photo workspace shell", () => {
    expect(resolvePhotoWorkspaceToolState("metadata-match")).toMatchObject({ mode: "raw-match", selectMode: "client", rawMatchMethod: "metadata" });
    expect(resolvePhotoWorkspaceToolState("ai-cull")).toMatchObject({ mode: "t-cut", selectMode: "manual" });
  });
});

describe("Olivia resolves detailed feature names through the workspace registry", () => {
  const cases: Array<[string, string]> = [
    ["메타데이터 셀렉", "/photo-sorting?tool=metadata-match"],
    ["유튜브 편집 콘티", "/video-studio?tab=plan&tool=youtube-conti"],
    ["프롬프터", "/video-studio?tab=shoot&tool=prompter"],
    ["초상권 동의서", "/clients?tab=documents&document=portrait-consent"],
    ["병원 채널 분석", "/channel-analyzer"],
    ["리뷰 콘텐츠", "/clients/reviews"],
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

describe("영상작업실 routing in Olivia OS", () => {
  it("opens legacy /video-sorting inside the 영상작업실 window on the sorting tab", async () => {
    const { resolveOliviaAppRoute } = await import("@/components/olivia-os/registry/oliviaAppRegistry");
    const resolved = resolveOliviaAppRoute("/video-sorting");
    expect(resolved?.app.id).toBe("video-studio");
    expect(resolved?.href).toBe("/video-studio?tab=post&tool=sorting");
  });
});
