import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { isAdminSession } from "@/lib/passkey";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extraPickCount, priceOrder, requiredPickCount, selectionStatus, validateCategoryPicks, validateOffers } from "@/lib/person-select/core";
import { isPersonSelectAccessMode, isPersonSelectCustomerViewMode, isPersonSelectProjectType, type PersonSelectAccessMode, type PersonSelectCategory, type PersonSelectOffer, type PersonSelectOrderItem } from "@/lib/person-select/types";
import { PERSON_SELECT_BUCKET, signedImageUrls } from "@/lib/person-select/server";
import { parseSeoulDateTime } from "@/lib/person-select/date";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";
import { firstPersonSelectImageByCategory, firstPersonSelectImageByOwner } from "@/lib/person-select/matching";
import { assessAccessModeChange, normalizeAccessModeChangeFacts } from "@/lib/person-select/projectSettings";
import { normalizeNasDownloadUrl } from "@/lib/person-select/reviewers";
import { canPersonSelectReviewerFinalize } from "@/lib/person-select/reviewerPermissions";
import { databaseApiFailure } from "@/lib/supabase/apiError";
import { loadAdminDeliveryItems } from "@/lib/person-select/deliveryServer";
import { countCustomerSelection } from "@/lib/person-select/customerSelection";
import {
  loadAdminProjectBase,
  loadOpenSelectionSaveFailures,
  loadSharedAdminProjectState,
} from "@/lib/person-select/server/adminProjectRepository";

export const dynamic = "force-dynamic";

async function getPersonSelectAdminResponse(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const db = getSupabaseAdmin();
  const { event, people, choices, images: imageGroups } = await loadAdminProjectBase(db, eventId);
  if (!event) return Response.json({ ok: false, error: "행사를 찾을 수 없습니다." }, { status: 404 });
  const choiceThumbUrls = await signedImageUrls(choices.flatMap((choice) => {
    const image = choice.person_select_images as unknown as { thumb_path?: string | null } | null;
    return image?.thumb_path ? [image.thumb_path] : [];
  }));
  const choiceRows = choices.map((choice) => {
    const image = choice.person_select_images as unknown as { original_file_name: string; source_rel_path: string; thumb_path: string } | null;
    return { ...choice, person_select_images: image ? { ...image, thumb_url: choiceThumbUrls.get(image.thumb_path) ?? "" } : null };
  });
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
  const saveFailures = await loadOpenSelectionSaveFailures(db, eventId);
  const failureCountFor = (actorType: "person" | "reviewer", actorId: string) => saveFailures.filter((failure) => failure.actor_type === actorType && failure.actor_id === actorId).length;
  const deliveryRows = await loadAdminDeliveryItems(db, eventId);
  const deliveriesByPerson = new Map<string, typeof deliveryRows>();
  for (const delivery of deliveryRows) {
    if (!delivery.person_id) continue;
    const list = deliveriesByPerson.get(delivery.person_id);
    if (list) list.push(delivery);
    else deliveriesByPerson.set(delivery.person_id, [delivery]);
  }
  const choicesByPerson = new Map<string, typeof choiceRows>();
  for (const choice of choiceRows) {
    const list = choicesByPerson.get(choice.person_id);
    if (list) list.push(choice);
    else choicesByPerson.set(choice.person_id, [choice]);
  }
  const peopleRows = (people ?? []).map((person) => {
    const ownChoices = choicesByPerson.get(person.id) ?? [];
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
      server_selected_count: countCustomerSelection(ownChoices.map(() => ({ selected: true }))),
      server_last_saved_at: latest,
      recent_save_failure_count: failureCountFor("person", person.id),
      deliveries: deliveriesByPerson.get(person.id) ?? [],
      delivery_count: deliveriesByPerson.get(person.id)?.length ?? 0,
      delivery_revision_count: deliveriesByPerson.get(person.id)?.filter((delivery) => delivery.status === "revision_requested").length ?? 0,
    };
  });
  const groups = Object.entries(groupCounts).sort(([a], [b]) => a.localeCompare(b, "ko", { numeric: true })).map(([label, image_count]) => ({ label, image_count }));
  let shared: Record<string, unknown> | null = null;
  if (event.access_mode === "project_shared") {
    const { reviewers, drafts, selections, latestByReviewer, selectedItems } = await loadSharedAdminProjectState(db, eventId);
    const draftItemsByReviewer = new Map<string, Array<Record<string, unknown>>>(drafts.map((draft) => [
      draft.reviewer_id,
      Array.isArray(draft.items) ? draft.items as Array<Record<string, unknown>> : [],
    ]));
    const imageById = new Map(imageGroups.map((image) => [image.id, image]));
    const sharedItemImageIds = [
      ...selectedItems.map((item) => item.image_id),
      ...[...draftItemsByReviewer.values()].flatMap((items) => items.map((item) => String(item.image_id ?? "")).filter(Boolean)),
    ];
    const sharedThumbUrls = await signedImageUrls([...new Set(sharedItemImageIds)].flatMap((imageId) => {
      const image = imageById.get(imageId);
      return image?.thumb_path ? [image.thumb_path] : [];
    }));
    const imageFor = (imageId: string) => {
      const image = imageById.get(imageId);
      return image ? {
        original_file_name: image.original_file_name,
        source_rel_path: image.source_rel_path,
        thumb_url: sharedThumbUrls.get(image.thumb_path) ?? "",
      } : null;
    };
    type SelectedItem = typeof selectedItems[number];
    const itemsBySelection = new Map<string, SelectedItem[]>();
    for (const item of selectedItems) {
      const list = itemsBySelection.get(item.selection_id);
      if (list) list.push(item);
      else itemsBySelection.set(item.selection_id, [item]);
    }
    const itemsFor = (selectionId: string) => (itemsBySelection.get(selectionId) ?? []).map((item) => {
      return {
        ...item,
        image: imageFor(item.image_id),
      };
    });
    const draftItemsFor = (reviewerId: string) => (draftItemsByReviewer.get(reviewerId) ?? []).flatMap((item) => {
      const imageId = String(item.image_id ?? "");
      if (!imageId) return [];
      const rating = Number(item.customer_rating);
      const colorLabel = Number(item.customer_color_label);
      return [{
        image_id: imageId,
        customer_rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
        customer_color_label: Number.isInteger(colorLabel) && colorLabel >= 6 && colorLabel <= 9 ? colorLabel : null,
        memo: typeof item.memo === "string" ? item.memo : "",
        image: imageFor(imageId),
      }];
    });
    const draftByReviewer = new Map(drafts.map((draft) => [draft.reviewer_id, draft]));
    const reviewerRows = reviewers.map((reviewer) => {
      const draft = draftByReviewer.get(reviewer.id);
      const selection = latestByReviewer.get(reviewer.id);
      const draftItems = draftItemsByReviewer.get(reviewer.id) ?? [];
      return {
        ...reviewer,
        can_finalize: canPersonSelectReviewerFinalize(reviewer),
        draft: draft ? {
          revision: draft.revision,
          selected_count: draftItems.length,
          selectedImageIds: draftItems.map((item) => String(item.image_id ?? "")).filter(Boolean),
          ratings: Object.fromEntries(draftItems.flatMap((item) => {
            const imageId = String(item.image_id ?? "");
            const rating = Number(item.customer_rating);
            return imageId && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? [[imageId, rating]] : [];
          })),
          colorLabels: Object.fromEntries(draftItems.flatMap((item) => {
            const imageId = String(item.image_id ?? "");
            const color = Number(item.customer_color_label);
            return imageId && Number.isInteger(color) && color >= 6 && color <= 9 ? [[imageId, color]] : [];
          })),
          imageNotes: Object.fromEntries(draftItems.flatMap((item) => {
            const imageId = String(item.image_id ?? "");
            const memo = typeof item.memo === "string" ? item.memo : "";
            return imageId && memo ? [[imageId, memo]] : [];
          })),
          customerMemo: typeof draft.customer_memo === "string" ? draft.customer_memo : "",
          items: draftItemsFor(reviewer.id),
          updatedAt: draft.updated_at,
          updated_at: draft.updated_at,
        } : null,
        selection: selection ? { ...selection, items: itemsFor(selection.id) } : null,
        server_selected_count: countCustomerSelection(draftItems.map(() => ({ selected: true }))),
        server_last_saved_at: draft?.updated_at ?? null,
        recent_save_failure_count: failureCountFor("reviewer", reviewer.id),
      };
    });
    const latestSelection = selections[0] ?? null;
    shared = {
      image_count: imageGroups.length,
      images: imageGroups.map((image) => ({
        id: image.id,
        original_file_name: image.original_file_name,
        relative_path: image.source_rel_path,
        thumbnail_url: "",
        image_url: "",
        sort_order: image.sort_order,
      })),
      selection: latestSelection ? { ...latestSelection, items: itemsFor(latestSelection.id) } : null,
      reviewers: reviewerRows,
      deliveries: deliveryRows.filter((delivery) => !delivery.person_id),
    };
  }
  return Response.json({
    ok: true,
    event,
    people: peopleRows,
    groups,
    shared,
    sync: {
      recent_failure_count: saveFailures.length,
      recent_failures: saveFailures.map((failure) => ({
        actor_type: failure.actor_type,
        actor_id: failure.actor_id,
        at: failure.occurred_at,
        error: failure.error_message,
      })),
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  try {
    return await getPersonSelectAdminResponse(request, context);
  } catch (cause) {
    const failure = databaseApiFailure(cause);
    console.error("[person-select] admin detail load failed", {
      eventId: (await context.params).eventId,
      code: cause && typeof cause === "object" && "code" in cause ? String(cause.code) : undefined,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return Response.json(
      { ok: false, code: failure.code, error: failure.error },
      {
        status: failure.status,
        headers: failure.retryAfterSeconds ? { "Retry-After": String(failure.retryAfterSeconds) } : undefined,
      },
    );
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params; const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const allowed = ["title", "deadline_at", "status", "categories", "retouch_options", "memo_max", "offer_notice", "extra_price", "extra_max", "offers", "project_type", "access_mode", "customer_view_mode", "customer_stage", "delivery_retention_days", "shared_link_active", "shared_token_expires_at", "nas_download_url", "customer_ai_results_visible"];
  const update = Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
  if (body.project_type !== undefined && !isPersonSelectProjectType(body.project_type)) return Response.json({ ok: false, error: "올바른 프로젝트 유형을 선택해 주세요." }, { status: 400 });
  if (body.customer_view_mode !== undefined && !isPersonSelectCustomerViewMode(body.customer_view_mode)) return Response.json({ ok: false, error: "올바른 고객 화면 방식을 선택해 주세요." }, { status: 400 });
  if (body.customer_stage !== undefined && body.customer_stage !== "select" && body.customer_stage !== "delivery") return Response.json({ ok: false, error: "올바른 고객 화면 단계를 선택해 주세요." }, { status: 400 });
  if (body.delivery_retention_days !== undefined && (!Number.isInteger(body.delivery_retention_days) || Number(body.delivery_retention_days) < 1 || Number(body.delivery_retention_days) > 3650)) return Response.json({ ok: false, error: "보정본 보관 기간은 1~3650일로 입력해 주세요." }, { status: 400 });
  if (body.access_mode !== undefined && !isPersonSelectAccessMode(body.access_mode)) return Response.json({ ok: false, error: "올바른 접근 방식을 선택해 주세요." }, { status: 400 });
  if (body.nas_download_url !== undefined) {
    const normalized = normalizeNasDownloadUrl(body.nas_download_url);
    if ("error" in normalized) return Response.json({ ok: false, error: normalized.error }, { status: 400 });
    update.nas_download_url = normalized.value;
  }
  if (body.customer_ai_results_visible !== undefined && typeof body.customer_ai_results_visible !== "boolean") {
    return Response.json({ ok: false, error: "AI 품질 결과 공개 설정을 확인해 주세요." }, { status: 400 });
  }
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

const PROJECT_STORAGE_DELETE_BATCH_SIZE = 500;
const ACTIVE_UPLOAD_STATUSES = ["queued", "uploading", "paused"];

export async function DELETE(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const confirmTitle = typeof body.confirmTitle === "string" ? body.confirmTitle.trim() : "";
  if (!confirmTitle) return Response.json({ ok: false, error: "삭제할 프로젝트명을 정확히 입력해 주세요." }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title").eq("id", eventId).maybeSingle();
  if (eventError) return Response.json({ ok: false, error: eventError.message }, { status: 500 });
  if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  if (event.title !== confirmTitle) return Response.json({ ok: false, error: "프로젝트명이 일치하지 않습니다." }, { status: 400 });

  const { data: activeUploads, error: activeUploadError } = await db.from("person_select_upload_jobs")
    .select("id,status")
    .eq("event_id", eventId)
    .in("status", ACTIVE_UPLOAD_STATUSES)
    .limit(1);
  if (activeUploadError) return Response.json({ ok: false, error: `업로드 상태를 확인하지 못했습니다: ${activeUploadError.message}` }, { status: 500 });
  if (activeUploads?.length) {
    return Response.json({ ok: false, error: "사진 업로드가 진행 중입니다. 업로드를 취소하거나 완료한 뒤 프로젝트를 삭제해 주세요." }, { status: 409 });
  }

  const images = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("thumb_path,preview_path")
    .eq("event_id", eventId)
    .order("id")
    .range(from, to));
  const storagePaths = [...new Set(images.flatMap((image) => [image.thumb_path, image.preview_path]).filter(Boolean))];

  const { data: deleted, error: deleteError } = await db.from("person_select_events")
    .delete()
    .eq("id", eventId)
    .eq("title", confirmTitle)
    .select("id")
    .maybeSingle();
  if (deleteError) return Response.json({ ok: false, error: `프로젝트를 삭제하지 못했습니다: ${deleteError.message}` }, { status: 500 });
  if (!deleted) return Response.json({ ok: false, error: "프로젝트가 변경되었거나 이미 삭제되었습니다." }, { status: 409 });

  const storage = db.storage.from(PERSON_SELECT_BUCKET);
  const cleanupErrors: string[] = [];
  let removedFileCount = 0;
  for (let offset = 0; offset < storagePaths.length; offset += PROJECT_STORAGE_DELETE_BATCH_SIZE) {
    const batch = storagePaths.slice(offset, offset + PROJECT_STORAGE_DELETE_BATCH_SIZE);
    const { error } = await storage.remove(batch);
    if (error) cleanupErrors.push(error.message);
    else removedFileCount += batch.length;
  }

  return Response.json({
    ok: true,
    deletedId: eventId,
    removedFileCount,
    ...(cleanupErrors.length ? { warning: "프로젝트는 삭제됐지만 일부 Storage 파일 정리가 남았습니다.", cleanupErrors } : {}),
  });
}
