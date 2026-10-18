import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { createVerification } from "./verification";

export const GALLERY_TOOL_NAMES = ["start_select_match_flow"] as const;

export async function executeGalleryTool(
  name: string,
  _input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  void _input;
  void _context;
  if (name === "start_select_match_flow") {
    return {
      tool: name,
      success: true,
      data: { flowId: crypto.randomUUID() },
      verification: createVerification({ executed: true }),
    };
  }
  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
