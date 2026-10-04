/** Each tab has one operational role.  RAW matching and T-cut cleanup are deliberately separate. */
export type PhotoWorkspaceMode = "plan" | "select" | "raw-match" | "classification" | "t-cut" | "retouch" | "resize" | "rename";
export type PhotoSelectMode = "ai" | "manual" | "client";
