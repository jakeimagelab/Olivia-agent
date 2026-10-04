export type VideoStudioSection = "plan" | "shoot" | "post" | "publish";

export type VideoStudioTool =
  | "video-conti"
  | "youtube-conti"
  | "broll"
  | "prompter"
  | "interview"
  | "reels"
  | "sorting"
  | "audio"
  | "magazine"
  | "ai-video";

export type LegacyVideoStudioTab = "interview" | "reels" | "webzine" | "sorting" | "audio";

export const VIDEO_STUDIO_TOOLS: Record<VideoStudioSection, readonly VideoStudioTool[]> = {
  plan: ["video-conti", "youtube-conti", "broll"],
  shoot: ["prompter"],
  post: ["interview", "reels", "sorting", "audio"],
  publish: ["magazine", "ai-video"],
};

export const DEFAULT_VIDEO_STUDIO_TOOL: Record<VideoStudioSection, VideoStudioTool> = {
  plan: "video-conti",
  shoot: "prompter",
  post: "interview",
  publish: "magazine",
};

const LEGACY_TABS: Record<LegacyVideoStudioTab, { section: VideoStudioSection; tool: VideoStudioTool }> = {
  interview: { section: "post", tool: "interview" },
  reels: { section: "post", tool: "reels" },
  webzine: { section: "publish", tool: "magazine" },
  sorting: { section: "post", tool: "sorting" },
  audio: { section: "post", tool: "audio" },
};

const SECTION_VALUES = new Set<VideoStudioSection>(["plan", "shoot", "post", "publish"]);

export function resolveVideoStudioRoute(tab: string | null | undefined, tool: string | null | undefined) {
  if (tab && tab in LEGACY_TABS) return LEGACY_TABS[tab as LegacyVideoStudioTab];
  const section = tab && SECTION_VALUES.has(tab as VideoStudioSection) ? tab as VideoStudioSection : "post";
  const allowedTools = VIDEO_STUDIO_TOOLS[section];
  const resolvedTool = tool && allowedTools.includes(tool as VideoStudioTool)
    ? tool as VideoStudioTool
    : DEFAULT_VIDEO_STUDIO_TOOL[section];
  return { section, tool: resolvedTool };
}

export function videoStudioHref(section: VideoStudioSection, tool: VideoStudioTool) {
  return `/video-studio?tab=${encodeURIComponent(section)}&tool=${encodeURIComponent(tool)}`;
}
