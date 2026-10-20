import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncSelectionSubmittedWorkflow } from "@/lib/photo-storage/shootingProgress";
import { assertWrite } from "@/lib/db/assertWrite";
import {
  canResubmitSelection,
  missingRequiredSelectionCategories,
  normalizeSelectionCategory,
  validateSelectionMemo,
} from "@/lib/select-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { selected_files, selected_items, customer_memo, share_token } = await req.json();

    if (!Array.isArray(selected_files) || selected_files.length === 0)
      return NextResponse.json({ ok: false, error: "선택된 파일이 없습니다" }, { status: 400 });

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("id, share_token, status, allow_resubmit, client_id, workflow_run_id")
      .eq("id", id)
      .single();

    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });
    if (gallery.share_token !== share_token)
      return NextResponse.json({ ok: false, error: "인증 오류" }, { status: 403 });
    if (!canResubmitSelection({ submitted: gallery.status === "selection_submitted", allowResubmit: gallery.allow_resubmit }))
      return NextResponse.json({ ok: false, error: "이미 제출이 완료되었습니다" }, { status: 409 });

    const now = new Date().toISOString();
    const { data: imageRows, error: imageError } = await sb
      .from("select_gallery_images")
      .select("id,original_file_name,scene_name,folder_name")
      .eq("gallery_id", id);
    if (imageError) throw imageError;
    const imageById = new Map((imageRows ?? []).map((image) => [image.id, image]));
    const imageByName = new Map((imageRows ?? []).map((image) => [image.original_file_name, image]));
    const requestedItems = Array.isArray(selected_items)
      ? selected_items
      : selected_files.map((fileName: string) => ({ file_name: fileName, memo: "", retouch_keys: [] }));
    const itemRows = requestedItems.map((item: any) => {
      const image = (typeof item?.image_id === "string" ? imageById.get(item.image_id) : null)
        ?? imageByName.get(String(item?.file_name ?? ""));
      if (!image || !selected_files.includes(image.original_file_name)) {
        throw new Error(`갤러리에 없는 사진입니다: ${String(item?.file_name ?? item?.image_id ?? "")}`);
      }
      const memo = typeof item?.memo === "string" ? item.memo : "";
      const memoError = validateSelectionMemo(memo, 1_000);
      if (memoError) throw new Error(memoError);
      const retouchKeys = Array.isArray(item?.retouch_keys)
        ? item.retouch_keys.filter((key: unknown): key is string => typeof key === "string").slice(0, 20)
        : [];
      return {
        gallery_id: id,
        image_id: image.id,
        file_name: image.original_file_name,
        category: normalizeSelectionCategory(image.scene_name, image.folder_name),
        memo,
        retouch_keys: retouchKeys,
      };
    });
    const missingCategories = missingRequiredSelectionCategories(
      (imageRows ?? []).map((image) => ({ category: normalizeSelectionCategory(image.scene_name, image.folder_name) })),
      itemRows,
    );
    if (missingCategories.length) {
      const labels: Record<string, string> = { profile: "프로필", staged: "연출", interior: "인테리어" };
      return NextResponse.json({ ok: false, error: `${missingCategories.map((key) => labels[key]).join(" · ")} 사진을 먼저 골라주세요.` }, { status: 400 });
    }

    const { data: selection, error: selErr } = await sb
      .from("client_photo_selections")
      .insert({
        gallery_id: id,
        client_id: gallery.client_id,
        workflow_run_id: gallery.workflow_run_id,
        method: "web_select",
        selected_files,
        selected_count: selected_files.length,
        customer_memo: customer_memo ?? null,
        submitted_at: now,
      })
      .select()
      .single();

    if (selErr) throw selErr;

    const { error: itemError } = await sb
      .from("client_photo_selection_items")
      .insert(itemRows.map((item) => ({ ...item, selection_id: selection.id })));
    if (itemError) {
      await sb.from("client_photo_selections").delete().eq("id", selection.id);
      throw itemError;
    }

    const galleryWrite = await sb
      .from("select_galleries")
      .update({ status: "selection_submitted", selected_count: selected_files.length, submitted_at: now, updated_at: now })
      .eq("id", id);
    assertWrite(galleryWrite, "웹 셀렉 제출 상태 기록");

    try {
      await syncSelectionSubmittedWorkflow(sb, gallery.workflow_run_id);
    } catch (workflowError) {
      // 고객의 셀렉 제출은 이미 저장됐다. 워크플로 동기화 오류로 제출을 실패 응답하면 고객이
      // 다시 제출해 중복될 수 있으므로 별도로 기록하고 제출 성공은 유지한다.
      console.warn("[select gallery workflow sync]", workflowError instanceof Error ? workflowError.message : workflowError);
    }

    return NextResponse.json({ ok: true, selection: { ...selection, items: itemRows } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
