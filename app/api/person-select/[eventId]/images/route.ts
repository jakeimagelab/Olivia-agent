import type { NextRequest } from "next/server";
import { isAdminSession } from "@/lib/passkey";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { getSharedPersonSelectImageUrls, parseSharedPersonSelectMediaVariant } from "@/lib/person-select/sharedPublic";
import { PublicSelectionRequestError, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type AdminImageRow = {
  id: string;
  owner_person_id: string | null;
  owner_group: string | null;
  category_key: string;
  original_file_name: string;
  source_rel_path: string;
  sort_order: number;
};

function isDeliveredPath(path: string) {
  const folders = path.normalize("NFC").split(/[\\/]+/).slice(0, -1);
  return folders.some(isDeliveredRoundFolder);
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const scope = request.nextUrl.searchParams.get("scope") ?? "all";
  const ownerId = request.nextUrl.searchParams.get("ownerId")?.trim() ?? "";
  const groupLabel = request.nextUrl.searchParams.get("groupLabel")?.trim() ?? "";
  if (!(["all", "person", "group"] as const).includes(scope as "all" | "person" | "group")) {
    return Response.json({ ok: false, error: "사진 범위가 올바르지 않습니다." }, { status: 400 });
  }
  if (scope === "person" && !ownerId) return Response.json({ ok: false, error: "고객을 선택해 주세요." }, { status: 400 });
  if (scope === "group" && !groupLabel) return Response.json({ ok: false, error: "그룹을 선택해 주세요." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const rows = await readAllPersonSelectRows<AdminImageRow>((from, to) => {
      let query = db.from("person_select_images")
        .select("id,owner_person_id,owner_group,category_key,original_file_name,source_rel_path,sort_order")
        .eq("event_id", eventId);
      if (scope === "person") query = query.eq("owner_person_id", ownerId);
      if (scope === "group") query = query.eq("owner_group", groupLabel);
      return query.order("sort_order", { ascending: true, nullsFirst: false }).order("id", { ascending: true }).range(from, to);
    });
    return Response.json({
      ok: true,
      images: rows.filter((row) => !isDeliveredPath(row.source_rel_path)),
    }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("[person-select-admin-image-list] failed", error);
    return Response.json({ ok: false, error: "사진 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    const body = await readPublicSelectionJson(request, 50_000);
    const imageIds = body && typeof body === "object" && !Array.isArray(body)
      ? (body as { imageIds?: unknown }).imageIds
      : null;
    if (!Array.isArray(imageIds) || imageIds.some((value) => typeof value !== "string")) {
      return Response.json({ ok: false, error: "사진 주소 요청 형식이 올바르지 않습니다." }, { status: 400 });
    }
    const variant = parseSharedPersonSelectMediaVariant((body as { variant?: unknown }).variant);
    const images = await getSharedPersonSelectImageUrls(getSupabaseAdmin(), eventId, imageIds as string[], variant);
    return Response.json({ ok: true, images }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    if (error instanceof PublicSelectionRequestError) return Response.json({ ok: false, error: error.message }, { status: error.status });
    console.error("[person-select-admin-media] failed", error);
    return Response.json({ ok: false, error: "사진 주소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}
