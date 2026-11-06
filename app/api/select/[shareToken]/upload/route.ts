import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncSelectionSubmittedWorkflow } from "@/lib/photo-storage/shootingProgress";
import {
  enforcePublicSelectionRateLimit,
  PublicSelectionRequestError,
  publicSelectionErrorResponse,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";
import {
  assertPublicGalleryLinkActive,
  getPublicSelectGallery,
  mapPublicSelectionRpcError,
} from "@/lib/select-gallery/publicServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "heic", "heif", "tif", "tiff", "png"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "upload-submit", limit: 10, windowSeconds: 300 });
    const gallery = await getPublicSelectGallery(db, shareToken);
    assertPublicGalleryLinkActive(gallery);
    if (!gallery.allow_download_upload) throw new PublicSelectionRequestError("선택 파일 업로드가 허용되지 않았습니다.", 403);
    const raw = await readPublicSelectionJson(request, 300_000);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new PublicSelectionRequestError("요청 형식이 올바르지 않습니다.");
    const body = raw as Record<string, unknown>;
    const requestKey = typeof body.requestKey === "string" ? body.requestKey.trim() : "";
    if (!/^[A-Za-z0-9:_-]{8,200}$/.test(requestKey)) throw new PublicSelectionRequestError("제출 요청 키가 올바르지 않습니다.");
    const customerMemo = typeof body.customerMemo === "string" ? body.customerMemo : "";
    if (customerMemo.length > 5_000) throw new PublicSelectionRequestError("전체 메모는 5000자까지 적을 수 있습니다.");
    if (!Array.isArray(body.fileNames) || body.fileNames.length === 0 || body.fileNames.length > 10_000) {
      throw new PublicSelectionRequestError("선택 파일을 확인해 주세요.");
    }
    const fileNames = [...new Set(body.fileNames.map((name) => typeof name === "string" ? name.trim() : "").filter(Boolean))];
    if (!fileNames.length || fileNames.some((name) => !ALLOWED_EXTENSIONS.has(name.split(".").at(-1)?.toLocaleLowerCase("en-US") ?? ""))) {
      throw new PublicSelectionRequestError("지원하지 않는 파일이 포함되어 있습니다.");
    }

    const { data, error } = await db.rpc("submit_public_select_gallery_upload", {
      p_share_token: shareToken,
      p_request_key: requestKey,
      p_selected_files: fileNames,
      p_customer_memo: customerMemo,
    });
    if (error) throw mapPublicSelectionRpcError(error.message);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.selection_id) throw new Error("제출 결과를 확인하지 못했습니다.");
    if (result.created) {
      try {
        await syncSelectionSubmittedWorkflow(db, gallery.workflow_run_id);
      } catch (workflowError) {
        console.warn("[public upload workflow sync]", workflowError instanceof Error ? workflowError.message : workflowError);
      }
    }
    const { data: selection, error: selectionError } = await db
      .from("client_photo_selections")
      .select("*,items:client_photo_selection_items(*)")
      .eq("id", result.selection_id)
      .single();
    if (selectionError) throw selectionError;
    return Response.json({ ok: true, created: Boolean(result.created), selection });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
