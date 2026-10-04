import { describe, expect, it } from "vitest";
import {
  resolveVideoStudioRoute,
  videoStudioHref,
} from "@/components/video-studio/videoStudioNavigation";

describe("video studio two-level navigation", () => {
  it.each([
    ["interview", "post", "interview"],
    ["reels", "post", "reels"],
    ["sorting", "post", "sorting"],
    ["audio", "post", "audio"],
    ["webzine", "publish", "magazine"],
  ])("maps legacy tab %s", (legacyTab, section, tool) => {
    expect(resolveVideoStudioRoute(legacyTab, null)).toEqual({ section, tool });
  });

  it("keeps valid section and tool pairs", () => {
    expect(resolveVideoStudioRoute("plan", "broll")).toEqual({ section: "plan", tool: "broll" });
    expect(resolveVideoStudioRoute("publish", "ai-video")).toEqual({ section: "publish", tool: "ai-video" });
  });

  it("falls back to the default tool for a mismatched pair", () => {
    expect(resolveVideoStudioRoute("shoot", "sorting")).toEqual({ section: "shoot", tool: "prompter" });
  });

  it("builds canonical nested URLs", () => {
    expect(videoStudioHref("post", "interview")).toBe("/video-studio?tab=post&tool=interview");
  });
});
