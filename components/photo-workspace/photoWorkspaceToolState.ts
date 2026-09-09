import type { PhotoSelectMode, PhotoWorkspaceMode, RawMatchView } from "./types";

export type PhotoWorkspaceToolId =
  | "select-raw"
  | "metadata-match"
  | "ai-cull"
  | "ai-search"
  | "classification"
  | "retouch";

export type PhotoWorkspaceToolState = {
  mode: PhotoWorkspaceMode;
  selectMode: PhotoSelectMode;
  rawMatchView?: RawMatchView;
};

// 2026-09-10 수정 지시서 2번 — metadata-select/retouch가 tool 파라미터 우회 없이 정식 탭이 됐다.
// 옛 ?tool= 딥링크(lib/workspaceGroups.ts, Olivia 자연어 라우팅)는 새 mode 체계로 매핑해서
// 그대로 계속 동작하게 유지한다. conversion(파일 변환)은 기능 자체를 삭제했으므로 제거.
const TOOL_STATES: Record<PhotoWorkspaceToolId, PhotoWorkspaceToolState> = {
  "select-raw": { mode: "select", selectMode: "client" },
  "metadata-match": { mode: "metadata-select", selectMode: "client" },
  "ai-cull": { mode: "raw-match", selectMode: "manual", rawMatchView: "ai-cull" },
  "ai-search": { mode: "select", selectMode: "ai" },
  classification: { mode: "classification", selectMode: "ai" },
  retouch: { mode: "retouch", selectMode: "manual" },
};

export function resolvePhotoWorkspaceToolState(tool?: string | null): PhotoWorkspaceToolState | undefined {
  if (!tool || !(tool in TOOL_STATES)) return undefined;
  return TOOL_STATES[tool as PhotoWorkspaceToolId];
}
