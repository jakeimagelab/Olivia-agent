import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";

export type PhotoWorkspaceToolId =
  | "conti"
  | "select-raw"
  | "metadata-match"
  | "ai-cull"
  | "t-cut"
  | "ai-search"
  | "classification"
  | "resize"
  | "rename"
  | "retouch";

export type PhotoWorkspaceToolState = {
  mode: PhotoWorkspaceMode;
  selectMode: PhotoSelectMode;
  rawMatchMethod?: "filename" | "metadata";
};

// 옛 딥링크는 역할이 같은 독립 탭으로만 정규화한다. AI 컷 정리와 RAW 매칭을 한 화면에
// 다시 합치지 않는다.
const TOOL_STATES: Record<PhotoWorkspaceToolId, PhotoWorkspaceToolState> = {
  conti: { mode: "plan", selectMode: "manual" },
  "select-raw": { mode: "select", selectMode: "client" },
  "metadata-match": { mode: "raw-match", selectMode: "client", rawMatchMethod: "metadata" },
  "ai-cull": { mode: "t-cut", selectMode: "manual" },
  "t-cut": { mode: "t-cut", selectMode: "manual" },
  "ai-search": { mode: "select", selectMode: "ai" },
  classification: { mode: "classification", selectMode: "ai" },
  resize: { mode: "resize", selectMode: "manual" },
  rename: { mode: "rename", selectMode: "manual" },
  retouch: { mode: "retouch", selectMode: "manual" },
};

export function resolvePhotoWorkspaceToolState(tool?: string | null): PhotoWorkspaceToolState | undefined {
  if (!tool || !(tool in TOOL_STATES)) return undefined;
  return TOOL_STATES[tool as PhotoWorkspaceToolId];
}
