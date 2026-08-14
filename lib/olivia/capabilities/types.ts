import type { ToolDef } from "@/lib/toolNav";

export type NavigationCapabilityResolution =
  | { kind: "match"; tool: ToolDef; confidence: number }
  | { kind: "ambiguous"; candidates: ToolDef[] }
  | { kind: "none" };
