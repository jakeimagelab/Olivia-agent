import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, parsePublicSelectionDraft, parsePublicSelectionRevision, PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT, PublicSelectionRequestError, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSharedPersonSelectOwnedImageIds, resolveSharedPersonSelectAccess, sharedDraftResponse, sharedReviewerTokenHash } from "@/lib/person-select/sharedPublic";
import { applySelectionDiffsToSharedSnapshot, parseSelectionSyncBatch } from "@/lib/person-select/selectionSync";
import { recordSelectionSaveFailure, selectionSyncFunctionMissing } from "@/lib/person-select/selectionSyncServer";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    await enforcePublicSelectionRateLimit({ db, request, token: `${reviewer.id}:${sharedReviewerTokenHash(shareToken)}`, action: "person-shared-draft-read", limit: 120, identityOnly: true });
    const { data, error } = await db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
    if (error) throw error;
    return Response.json({ ok: true, draft: sharedDraftResponse(data) });
  } catch (error) { return publicSelectionErrorResponse(error); }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  let failureContext: { eventId: string; reviewerId: string } | null = null;
  const db = getSupabaseAdmin();
  try {
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    failureContext = { eventId: event.id, reviewerId: reviewer.id };
    await enforcePublicSelectionRateLimit({ db, request, token: `${reviewer.id}:${sharedReviewerTokenHash(shareToken)}`, action: "person-shared-draft-write", limit: 60, identityOnly: true });
    const body = await readPublicSelectionJson(request);
    if (body && typeof body === "object" && !Array.isArray(body) && (body as Record<string, unknown>).customerMemoOnly === true) {
      const customerMemo = typeof (body as Record<string, unknown>).customerMemo === "string"
        ? String((body as Record<string, unknown>).customerMemo)
        : "";
      if (customerMemo.length > PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT) {
        throw new PublicSelectionRequestError(`전체 메모는 ${PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT}자까지 적을 수 있습니다.`);
      }
      const { data, error } = await db.rpc("save_person_select_shared_customer_memo", {
        p_event_id: event.id,
        p_reviewer_id: reviewer.id,
        p_customer_memo: customerMemo,
      });
      if (!error) return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(data) ? data[0] : data) });
      if (!selectionSyncFunctionMissing(error)) throw error;
      const { data: currentDraft, error: currentError } = await db.from("person_select_shared_drafts")
        .select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
      if (currentError) throw currentError;
      const current = sharedDraftResponse(currentDraft);
      const storedItems = current.selectedImageIds.map((imageId: string) => ({
        image_id: imageId,
        customer_rating: current.ratings[imageId] ?? null,
        customer_color_label: current.colorLabels[imageId] ?? null,
        memo: current.imageNotes[imageId] ?? "",
      }));
      const { data: fallbackData, error: fallbackError } = await db.rpc("save_person_select_shared_draft_v2", {
        p_event_id: event.id,
        p_reviewer_id: reviewer.id,
        p_expected_revision: current.revision,
        p_items: storedItems,
        p_customer_memo: customerMemo,
      });
      if (fallbackError) throw fallbackError;
      return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(fallbackData) ? fallbackData[0] : fallbackData) });
    }
    if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as Record<string, unknown>).diffs)) {
      const ownedImageIds = await getSharedPersonSelectOwnedImageIds(db, event.id, body);
      let parsed: ReturnType<typeof parseSelectionSyncBatch>;
      try { parsed = parseSelectionSyncBatch(body, ownedImageIds); }
      catch (error) { throw new PublicSelectionRequestError(error instanceof Error ? error.message : "저장 요청 형식이 올바르지 않습니다."); }
      const { data, error } = await db.rpc("save_person_select_shared_item_diffs", {
        p_event_id: event.id,
        p_reviewer_id: reviewer.id,
        p_client_id: parsed.clientId,
        p_diffs: parsed.diffs,
      });
      if (!error) return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(data) ? data[0] : data) });
      if (!selectionSyncFunctionMissing(error)) throw error;

      // 마이그레이션 적용 전 배포도 기존 전체 초안 RPC로 안전하게 동작한다.
      const { data: currentDraft, error: currentError } = await db.from("person_select_shared_drafts")
        .select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
      if (currentError) throw currentError;
      const current = sharedDraftResponse(currentDraft);
      const merged = applySelectionDiffsToSharedSnapshot(current, parsed.diffs);
      const selected = new Set(merged.selectedImageIds);
      const storedItems = merged.selectedImageIds.map((imageId) => ({
        image_id: imageId,
        customer_rating: merged.ratings[imageId] ?? null,
        customer_color_label: merged.colorLabels[imageId] ?? null,
        memo: merged.imageNotes[imageId] ?? "",
      })).filter((item) => selected.has(item.image_id));
      const { data: fallbackData, error: fallbackError } = await db.rpc("save_person_select_shared_draft_v2", {
        p_event_id: event.id,
        p_reviewer_id: reviewer.id,
        p_expected_revision: current.revision,
        p_items: storedItems,
        p_customer_memo: current.customerMemo,
      });
      if (fallbackError) {
        if (/draft_revision_conflict|40001|PT409/i.test(`${fallbackError.message} ${fallbackError.code ?? ""}`)) {
          const { data: latest } = await db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
          return Response.json({ ok: false, code: "SYNC_RETRY", error: "다른 화면의 최신 선택을 합친 뒤 다시 저장합니다.", draft: sharedDraftResponse(latest) }, { status: 409 });
        }
        throw fallbackError;
      }
      return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(fallbackData) ? fallbackData[0] : fallbackData) });
    }
    const expectedRevision = parsePublicSelectionRevision(body);
    // Expected optimistic-lock conflicts are handled before the RPC. The RPC uses
    // PT409 for the final race check so PostgREST returns HTTP 409 without treating
    // a stale revision as a retryable serialization failure.
    const { data: currentDraft, error: currentDraftError } = await db
      .from("person_select_shared_drafts")
      .select("*")
      .eq("event_id", event.id)
      .eq("reviewer_id", reviewer.id)
      .maybeSingle();
    if (currentDraftError) throw currentDraftError;
    const currentRevision = Number(currentDraft?.revision ?? 0);
    if (currentRevision !== expectedRevision) {
      return Response.json(
        { ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다.", draft: sharedDraftResponse(currentDraft) },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }
    const ownedImageIds = await getSharedPersonSelectOwnedImageIds(db, event.id, body);
    const parsed = parsePublicSelectionDraft(body, ownedImageIds);
    const storedItems = parsed.items.map((item) => ({ image_id: item.imageId, customer_rating: item.rating, customer_color_label: item.colorLabel, memo: item.memo }));
    const { data, error } = await db.rpc("save_person_select_shared_draft_v2", {
      p_event_id: event.id,
      p_reviewer_id: reviewer.id,
      p_expected_revision: parsed.revision,
      p_items: storedItems,
      p_customer_memo: parsed.customerMemo,
    });
    if (error) {
      if (/draft_revision_conflict|40001|PT409/i.test(`${error.message} ${error.code ?? ""}`)) {
        const { data: latest } = await db.from("person_select_shared_drafts").select("*").eq("event_id", event.id).eq("reviewer_id", reviewer.id).maybeSingle();
        return Response.json(
          { ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다.", draft: sharedDraftResponse(latest) },
          { status: 409, headers: { "Retry-After": "30" } },
        );
      }
      throw error;
    }
    return Response.json({ ok: true, draft: sharedDraftResponse(Array.isArray(data) ? data[0] : data) });
  } catch (error) {
    if (failureContext) await recordSelectionSaveFailure({ db, eventId: failureContext.eventId, actorType: "reviewer", actorId: failureContext.reviewerId, error, stage: "shared_draft" });
    return publicSelectionErrorResponse(error);
  }
}
