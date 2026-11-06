import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extraPickCount, priceOrder, requiredPickCount, selectionStatus, validateCategoryPicks, validateOffers } from "@/lib/person-select/core";
import { isPersonSelectAccessMode, isPersonSelectCustomerViewMode, isPersonSelectProjectType, type PersonSelectAccessMode, type PersonSelectCategory, type PersonSelectOffer, type PersonSelectOrderItem } from "@/lib/person-select/types";
import { signedImageUrl, signedImageUrls } from "@/lib/person-select/server";
import { parseSeoulDateTime } from "@/lib/person-select/date";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { firstPersonSelectImageByCategory, firstPersonSelectImageByOwner } from "@/lib/person-select/matching";
import { assessAccessModeChange, normalizeAccessModeChangeFacts } from "@/lib/person-select/projectSettings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const db = getSupabaseAdmin();
  const [{ data: event, error }, { data: people }, choices, imageGroups] = await Promise.all([
    db.from("person_select_events").select("*").eq("id", eventId).single(),
    db.from("person_select_people").select("id,event_id,display_name,login_name,group_label,first_seen_at,last_seen_at,submitted_at,updated_at,orders,orders_updated_at").eq("event_id", eventId).order("display_name"),
    readAllPersonSelectRows((from, to) => db.from("person_select_choices")
      .select("id,event_id,person_id,category_key,image_id,retouch_keys,memo,updated_at,person_select_images(original_file_name,source_rel_path,thumb_path)")
      .eq("event_id", eventId)
      .order("id")
      .range(from, to)),
    readAllPersonSelectRows((from, to) => db.from("person_select_images")
      .select("id,owner_person_id,owner_group,category_key,original_file_name,source_rel_path,thumb_path,sort_order")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("id")
      .range(from, to)),
  ]);
  if (error || !event) return Response.json({ ok: false, error: error?.message || "행사를 찾을 수 없습니다." }, { status: 404 });
  const choiceRows = await Promise.all(choices.map(async (choice) => {
    const image = choice.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
    return { ...choice, person_select_images: image ? { ...image, thumb_url: await signedImageUrl(image.thumb_path) } : null };
  }));
  // 사람별·항목별 올라온 사진 수. 담임(homeroom)은 반 단위로 센다.
  const personCounts = new Map<string, Record<string, number>>();
  const groupCounts: Record<string, number> = {};
  for (const row of imageGroups) {
    if (row.category_key === "homeroom") {
      if (row.owner_group) groupCounts[row.owner_group] = (groupCounts[row.owner_group] ?? 0) + 1;
      continue;
    }
    if (!row.owner_person_id) continue;
    const counts = personCounts.get(row.owner_person_id) ?? {};
    counts[row.category_key] = (counts[row.category_key] ?? 0) + 1;
    personCounts.set(row.owner_person_id, counts);
  }
  const representativeImages = firstPersonSelectImageByOwner(imageGroups);
  const categoryRepresentativeImages = firstPersonSelectImageByCategory(imageGroups);
  const representativeUrls = await signedImageUrls([
    ...representativeImages.values(),
    ...categoryRepresentativeImages.values(),
  ].map((image) => image.thumb_path));
  const publicRepresentative = (image: typeof imageGroups[number]) => ({
    category_key: image.category_key,
    original_file_name: image.original_file_name,
    source_rel_path: image.source_rel_path,
    thumb_url: representativeUrls.get(image.thumb_path) ?? "",
  });
  const categories = (event.categories ?? []) as PersonSelectCategory[];
  const peopleRows = (people ?? []).map((person) => {
    const ownChoices = choiceRows.filter((choice) => choice.person_id === person.id);
    const latest = ownChoices.map((choice) => choice.updated_at).sort().at(-1) ?? null;
    const imageCounts: Record<string, number> = { ...(personCounts.get(person.id) ?? {}) };
    imageCounts.homeroom = person.group_label ? groupCounts[person.group_label] ?? 0 : 0;
    const needCounts = Object.fromEntries(categories.map((category) => [category.key, requiredPickCount(category.pick, imageCounts[category.key] ?? 0)]));
    return {
      ...person,
      choices: ownChoices,
      image_counts: imageCounts,
      need_counts: needCounts,
      representative_image: (() => {
        const image = representativeImages.get(person.id);
        return image ? publicRepresentative(image) : null;
      })(),
      representative_images: Object.fromEntries(categories.flatMap((category) => {
        const image = categoryRepresentativeImages.get(`${person.id}\u0000${category.key}`);
        return image ? [[category.key, publicRepresentative(image)]] : [];
      })),
      order: (() => {
        const chosenCounts = ownChoices.reduce<Record<string, number>>((acc, choice) => { acc[choice.category_key] = (acc[choice.category_key] ?? 0) + 1; return acc; }, {});
        const photoNames = Object.fromEntries(ownChoices.map((choice) => [choice.image_id, choice.person_select_images?.original_file_name ?? ""]));
        return priceOrder({ offers: (event.offers ?? []) as PersonSelectOffer[], items: (person.orders ?? []) as PersonSelectOrderItem[], extraCount: extraPickCount(categories, chosenCounts), extraPrice: Number(event.extra_price) || 0, photoNames });
      })(),
      status_label: selectionStatus({ firstSeenAt: person.first_seen_at, submittedAt: person.submitted_at, choiceCount: ownChoices.length, latestChoiceAt: latest }),
      latest_activity_at: latest || person.last_seen_at || person.first_seen_at,
    };
  });
  const groups = Object.entries(groupCounts).sort(([a], [b]) => a.localeCompare(b, "ko", { numeric: true })).map(([label, image_count]) => ({ label, image_count }));
  let shared: Record<string, unknown> | null = null;
  if (event.access_mode === "project_shared") {
    const [{ data: selection }, sharedImageUrls] = await Promise.all([
      db.from("person_select_shared_selections").select("id,submitted_at,customer_memo").eq("event_id", eventId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
      signedImageUrls(imageGroups.map((image) => image.thumb_path)),
    ]);
    const { data: selectedItems } = selection
      ? await db.from("person_select_shared_selection_items").select("image_id,customer_rating,memo,person_select_images(original_file_name,source_rel_path,thumb_path)").eq("selection_id", selection.id)
      : { data: [] };
    const itemImages = (selectedItems ?? []).flatMap((item) => {
      const image = item.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
      return image ? [image] : [];
    });
    const itemUrls = await signedImageUrls(itemImages.map((image) => image.thumb_path));
    shared = {
      image_count: imageGroups.length,
      images: imageGroups.map((image) => ({
        id: image.id,
        original_file_name: image.original_file_name,
        source_rel_path: image.source_rel_path,
        thumb_url: sharedImageUrls.get(image.thumb_path) ?? "",
      })),
      selection: selection ? {
        ...selection,
        items: (selectedItems ?? []).map((item) => {
          const image = item.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
          return { ...item, image: image ? { ...image, thumb_url: itemUrls.get(image.thumb_path) ?? "" } : null };
        }),
      } : null,
    };
  }
  return Response.json({ ok: true, event, people: peopleRows, groups, shared });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ["title", "deadline_at", "status", "categories", "retouch_options", "memo_max", "offer_notice", "extra_price", "extra_max", "offers", "project_type", "access_mode", "customer_view_mode", "shared_link_active", "shared_token_expires_at"];
  const update = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  if (body.project_type !== undefined && !isPersonSelectProjectType(body.project_type)) return Response.json({ ok: false, error: "올바른 프로젝트 유형을 선택해 주세요." }, { status: 400 });
  if (body.customer_view_mode !== undefined && !isPersonSelectCustomerViewMode(body.customer_view_mode)) return Response.json({ ok: false, error: "올바른 고객 화면 방식을 선택해 주세요." }, { status: 400 });
  if (body.access_mode !== undefined && !isPersonSelectAccessMode(body.access_mode)) return Response.json({ ok: false, error: "올바른 접근 방식을 선택해 주세요." }, { status: 400 });
  if (body.deadline_at !== undefined) {
    const deadlineAt = parseSeoulDateTime(body.deadline_at);
    if (!deadlineAt) return Response.json({ ok: false, error: "올바른 마감일을 입력해 주세요." }, { status: 400 });
    update.deadline_at = deadlineAt;
  }
  if (body.categories !== undefined) {
    const problem = validateCategoryPicks(body.categories);
    if (problem) return Response.json({ ok: false, error: problem }, { status: 400 });
    update.categories = (body.categories as PersonSelectCategory[]).map((item) => ({ key: item.key, label: item.label, pick: item.pick }));
  }
  if (body.offer_notice !== undefined && (typeof body.offer_notice !== "string" || body.offer_notice.length > 2000)) return Response.json({ ok: false, error: "안내 문구는 2000자까지 적을 수 있습니다." }, { status: 400 });
  for (const key of ["extra_price", "extra_max"] as const) {
    if (body[key] !== undefined && (!Number.isInteger(body[key]) || Number(body[key]) < 0 || Number(body[key]) > (key === "extra_max" ? 50 : 100_000_000))) return Response.json({ ok: false, error: key === "extra_max" ? "추가로 고를 수 있는 장수는 0~50장입니다." : "추가 보정 가격을 원 단위 숫자로 입력해 주세요." }, { status: 400 });
  }
  if (body.offers !== undefined) {
    const problem = validateOffers(body.offers);
    if (problem) return Response.json({ ok: false, error: problem }, { status: 400 });
  }
  if (update.status && !["draft", "open", "closed"].includes(String(update.status))) return Response.json({ ok: false, error: "올바르지 않은 행사 상태입니다." }, { status: 400 });
  if (body.access_mode !== undefined) {
    const db = getSupabaseAdmin();
    const [{ data: current }, factsResult] = await Promise.all([
      db.from("person_select_events").select("access_mode,shared_token").eq("id", eventId).maybeSingle(),
      db.rpc("person_select_access_mode_facts", { p_event_id: eventId }),
    ]);
    if (!current) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const currentMode = (current.access_mode ?? "individual") as PersonSelectAccessMode;
    if (currentMode !== body.access_mode) {
      if (factsResult.error) return Response.json({ ok: false, error: `접근 방식 변경 상태를 확인하지 못했습니다: ${factsResult.error.message}` }, { status: 500 });
      const facts = normalizeAccessModeChangeFacts(factsResult.data);
      const assessment = assessAccessModeChange({ current: currentMode, next: body.access_mode, ...facts });
      if (!assessment.allowed) return Response.json({ ok: false, code: "ACCESS_MODE_CHANGE_BLOCKED", error: assessment.reason, facts }, { status: 409 });
      const confirmed = body.confirm_access_mode_impact === true;
      if (assessment.requiresConfirmation && !confirmed) {
        return Response.json({ ok: false, code: "ACCESS_MODE_CONFIRMATION_REQUIRED", error: assessment.warning, warning: assessment.warning, facts }, { status: 409 });
      }
      const sharedToken = body.access_mode === "project_shared" && !current.shared_token ? randomBytes(32).toString("hex") : current.shared_token;
      const { data: transitionData, error: transitionError } = await db.rpc("apply_person_select_access_mode_change", {
        p_event_id: eventId,
        p_expected_mode: currentMode,
        p_next_mode: body.access_mode,
        p_expected_facts: facts,
        p_confirmed: confirmed,
        p_shared_token: sharedToken,
        p_actor: "admin_session",
      });
      if (transitionError) return Response.json({ ok: false, error: `접근 방식을 변경하지 못했습니다: ${transitionError.message}` }, { status: 500 });
      const transition = transitionData as { ok?: boolean; code?: string; error?: string; event?: Record<string, unknown> } | null;
      if (!transition?.ok) return Response.json({ ok: false, code: transition?.code ?? "ACCESS_MODE_CHANGE_FAILED", error: transition?.error ?? "접근 방식을 변경하지 못했습니다." }, { status: 409 });
      delete update.access_mode;
      if (Object.keys(update).length === 0) return Response.json({ ok: true, event: transition.event });
    }
  }
  update.updated_at = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin().from("person_select_events").update(update).eq("id", eventId).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 400 });
  return Response.json({ ok: true, event: data });
}
