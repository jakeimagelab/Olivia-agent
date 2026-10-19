import type { PhotoFileOpsMode, PhotoSelectMode, PhotoWorkspaceMode } from "./types";

export type PhotoWorkspaceToolId =
  | "jpg-prep"
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
  fileOpsMode?: PhotoFileOpsMode;
  rawMatchMethod?: "filename" | "metadata";
};

// 옛 딥링크는 역할이 같은 독립 탭으로만 정규화한다. AI 컷 정리와 RAW 매칭을 한 화면에
// 다시 합치지 않는다.
const TOOL_STATES: Record<PhotoWorkspaceToolId, PhotoWorkspaceToolState> = {
  "jpg-prep": { mode: "jpg-prep", selectMode: "manual" },
  "select-raw": { mode: "select", selectMode: "client" },
  "metadata-match": { mode: "raw-match", selectMode: "client", rawMatchMethod: "metadata" },
  "ai-cull": { mode: "select", selectMode: "tcut" },
  "t-cut": { mode: "select", selectMode: "tcut" },
  "ai-search": { mode: "select", selectMode: "ai" },
  classification: { mode: "classification", selectMode: "ai" },
  resize: { mode: "file-ops", selectMode: "manual", fileOpsMode: "resize" },
  rename: { mode: "file-ops", selectMode: "manual", fileOpsMode: "rename" },
  retouch: { mode: "retouch", selectMode: "manual" },
};

export function resolvePhotoWorkspaceToolState(tool?: string | null): PhotoWorkspaceToolState | undefined {
  if (!tool || !(tool in TOOL_STATES)) return undefined;
  return TOOL_STATES[tool as PhotoWorkspaceToolId];
}

export function resolveLegacyPhotoWorkspaceMode(mode?: string | null): PhotoWorkspaceToolState | undefined {
  if (mode === "t-cut") return TOOL_STATES["t-cut"];
  if (mode === "resize") return TOOL_STATES.resize;
  if (mode === "rename") return TOOL_STATES.rename;
  return undefined;
}

/** Returns canonical query params only when an old top-level mode/tool was supplied. */
export function canonicalizePhotoWorkspaceParams(input: URLSearchParams): URLSearchParams | null {
  const tool = input.get("tool");
  const legacyMode = resolveLegacyPhotoWorkspaceMode(input.get("mode"));
  const legacyTool = tool && ["ai-cull", "t-cut", "resize", "rename"].includes(tool)
    ? resolvePhotoWorkspaceToolState(tool)
    : undefined;
  const state = legacyTool ?? legacyMode;
  if (!state) return null;

  const output = new URLSearchParams(input.toString());
  output.delete("tab");
  output.delete("tool");
  output.set("mode", state.mode);
  if (state.mode === "select") output.set("selectMode", state.selectMode);
  else output.delete("selectMode");
  if (state.mode === "file-ops" && state.fileOpsMode) output.set("fileOpsMode", state.fileOpsMode);
  else output.delete("fileOpsMode");
  return output;
}
