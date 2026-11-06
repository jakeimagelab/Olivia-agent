import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncSelectionSubmittedWorkflow } from "@/lib/photo-storage/shootingProgress";
import { writeWorkflowCheckSafely } from "@/lib/workflowCheckPersistence";
import { missingRequiredSelectionCategories, normalizeSelectionCategory } from "@/lib/select-core";
import {
  enforcePublicSelectionRateLimit,
  parsePublicSelectionSubmit,
  publicSelectionErrorResponse,
  readPublicSelectionJson,
} from "@/lib/select-gallery/publicSelection";
import {
  assertPublicGalleryAvailable,
  getPublicSelectGallery,
  mapPublicSelectionRpcError,
} from "@/lib/select-gallery/publicServer";
import { getGalleryImages } from "@/lib/selectGallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "submit", limit: 15, windowSeconds: 300 });
    const gallery = await getPublicSelectGallery(db, shareToken);
    assertPublicGalleryAvailable(gallery);
    if (!gallery.allow_web_select) return Response.json({ ok: false, error: "웹 사진 선택이 허용되지 않았습니다." }, { status: 403 });

    const imageRows = await getGalleryImages(db, gallery.id);
    const body = await readPublicSelectionJson(request);
    const parsed = parsePublicSelectionSubmit(body, new Set((imageRows ?? []).map((image) => image.id)));
    const selectedIds = new Set(parsed.items.map((item) => item.imageId));
    const categorized = (imageRows ?? []).map((image) => ({
      ...image,
      category: normalizeSelectionCategory(image.scene_name, image.folder_name),
    }));
    const missingCategories = missingRequiredSelectionCategories(
      categorized,
      categorized.filter((image) => selectedIds.has(image.id)),
    );
    if (missingCategories.length) {
      const labels: Record<string, string> = { profile: "프로필", staged: "연출", interior: "인테리어" };
      return Response.json({ ok: false, error: `${missingCategories.map((key) => labels[key]).join(" · ")} 사진을 먼저 골라주세요.` }, { status: 400 });
    }

    const { data, error } = await db.rpc("submit_public_select_gallery", {
      p_share_token: shareToken,
      p_request_key: parsed.requestKey,
      p_items: parsed.items.map((item) => ({ image_id: item.imageId, rating: item.rating, memo: item.memo })),
      p_customer_memo: parsed.customerMemo,
      p_submission_source: gallery.view_mode === "bridge" ? "public_bridge" : "classic_web",
    });
    if (error) throw mapPublicSelectionRpcError(error.message);
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.selection_id) throw new Error("제출 결과를 확인하지 못했습니다.");

    if (result.created) {
      const now = new Date().toISOString();
      try {
        if (gallery.workflow_run_id) {
          await writeWorkflowCheckSafely(db, {
            workflowRunId: gallery.workflow_run_id,
            key: "client_selected",
            done: true,
            by: "auto",
            at: now,
          });
        }
        await syncSelectionSubmittedWorkflow(db, gallery.workflow_run_id);
      } catch (workflowError) {
        console.warn("[public select workflow sync]", workflowError instanceof Error ? workflowError.message : workflowError);
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
