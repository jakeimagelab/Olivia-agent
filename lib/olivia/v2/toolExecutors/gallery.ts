import { createGallery, getGallery } from "@/lib/olivia/tools/gallery";
import type { OliviaContextSnapshot, OliviaToolResult } from "@/lib/olivia/v2/types";
import { fromLegacyResult } from "./common";
import { createVerification } from "./verification";

export const GALLERY_TOOL_NAMES = ["get_gallery", "create_gallery", "start_select_match_flow"] as const;

export async function executeGalleryTool(
  name: string,
  input: Record<string, unknown>,
  _context: OliviaContextSnapshot,
): Promise<OliviaToolResult> {
  if (name === "get_gallery") return fromLegacyResult(name, await getGallery(input));
  if (name === "create_gallery") return fromLegacyResult(name, await createGallery(input));

  if (name === "start_select_match_flow") {
    // 서버 작업 없음 — flowId만 발급하면 클라이언트가 그 값으로 채팅 카드/스토어를 초기화한다.
    // 실제 폴더 스캔·복사는 전부 브라우저(File System Access API)에서만 가능해서 여기선 할 수 없다.
    return { tool: name, success: true, data: { flowId: crypto.randomUUID() }, verification: createVerification({ executed: true }) };
  }

  throw new Error("지원하지 않는 Olivia 작업이에요.");
}
