import type { SupabaseClient } from "@supabase/supabase-js";
import { PublicSelectionRequestError } from "@/lib/select-gallery/publicSelection";

const PUBLIC_GALLERY_COLUMNS = [
  "id",
  "share_token",
  "share_token_version",
  "view_mode",
  "status",
  "file_expires_at",
  "allow_web_select",
  "allow_download_upload",
  "allow_download_zip",
  "allow_resubmit",
  "client_id",
  "workflow_run_id",
].join(",");

export async function getPublicSelectGallery(db: SupabaseClient, shareToken: string) {
  const { data, error } = await db
    .from("select_galleries")
    .select(PUBLIC_GALLERY_COLUMNS)
    .eq("share_token", shareToken)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PublicSelectionRequestError("링크를 찾을 수 없습니다.", 404);
  return data as unknown as {
    id: string;
    share_token: string;
    share_token_version: number;
    view_mode: "classic" | "bridge";
    status: string;
    file_expires_at: string;
    allow_web_select: boolean;
    allow_download_upload: boolean;
    allow_download_zip: boolean;
    allow_resubmit: boolean;
    client_id: string | null;
    workflow_run_id: string | null;
  };
}

export function assertPublicGalleryAvailable(
  gallery: { status: string; file_expires_at: string },
) {
  if (gallery.status === "expired" || new Date(gallery.file_expires_at).getTime() <= Date.now()) {
    throw new PublicSelectionRequestError("사진 보관 기간이 만료되었습니다.", 410);
  }
}

/** 다운로드 후 파일명 제출은 파일 보관 만료 뒤에도 허용한다. */
export function assertPublicGalleryLinkActive(gallery: { status: string }) {
  if (gallery.status === "expired") {
    throw new PublicSelectionRequestError("만료된 링크입니다.", 410);
  }
}

export function mapPublicSelectionRpcError(message: string) {
  if (message.includes("GALLERY_NOT_FOUND") || message.includes("INVALID_SHARE_TOKEN")) return new PublicSelectionRequestError("링크를 찾을 수 없습니다.", 404);
  if (message.includes("GALLERY_EXPIRED")) return new PublicSelectionRequestError("사진 보관 기간이 만료되었습니다.", 410);
  if (message.includes("WEB_SELECT_DISABLED")) return new PublicSelectionRequestError("웹 사진 선택이 허용되지 않았습니다.", 403);
  if (message.includes("UPLOAD_SELECT_DISABLED")) return new PublicSelectionRequestError("선택 파일 업로드가 허용되지 않았습니다.", 403);
  if (message.includes("RESUBMIT_DISABLED")) return new PublicSelectionRequestError("이미 제출이 완료되었습니다.", 409);
  if (message.includes("SELECTION_REQUIRED")) return new PublicSelectionRequestError("한 장 이상의 사진을 선택해 주세요.");
  if (message.includes("INVALID_IMAGE_SELECTION") || message.includes("INVALID_SELECTION_ITEMS")) return new PublicSelectionRequestError("이 갤러리에 없는 사진이 포함되어 있습니다.");
  if (message.includes("INVALID_OR_AMBIGUOUS_FILE_SELECTION")) return new PublicSelectionRequestError("갤러리에서 파일명을 하나로 확인할 수 없습니다.");
  if (message.includes("REQUEST_KEY_CONFLICT")) return new PublicSelectionRequestError("중복 제출 요청을 확인할 수 없습니다.", 409);
  return new Error(message);
}
