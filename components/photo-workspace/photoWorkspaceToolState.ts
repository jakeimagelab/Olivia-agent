import type { PhotoSelectMode, PhotoWorkspaceMode } from "./types";

export type PhotoWorkspaceToolId =
  | "select-raw"
  | "metadata-match"
  | "ai-cull"
  | "ai-search"
  | "classification"
  | "retouch"
  | "conversion";

export type PhotoWorkspaceToolState = {
  mode: PhotoWorkspaceMode;
  selectMode: PhotoSelectMode;
};

const TOOL_STATES: Record<PhotoWorkspaceToolId, PhotoWorkspaceToolState> = {
  "select-raw": { mode: "select", selectMode: "client" },
  "metadata-match": { mode: "select", selectMode: "client" },
  "ai-cull": { mode: "select", selectMode: "manual" },
  "ai-search": { mode: "select", selectMode: "ai" },
  classification: { mode: "classification", selectMode: "ai" },
  retouch: { mode: "select", selectMode: "manual" },
  conversion: { mode: "conversion", selectMode: "ai" },
};

export function resolvePhotoWorkspaceToolState(tool?: string | null): PhotoWorkspaceToolState | undefined {
  if (!tool || !(tool in TOOL_STATES)) return undefined;
  return TOOL_STATES[tool as PhotoWorkspaceToolId];
}
