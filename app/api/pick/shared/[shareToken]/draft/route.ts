import { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, parsePublicSelectionDraft, parsePublicSelectionRevision, PUBLIC_SELECTION_CUSTOMER_MEMO_LIMIT, PublicSelectionRequestError, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSharedPersonSelectOwnedImageIds, resolveSharedPersonSelectAccess, sharedDraftResponse, sharedReviewerTokenHash } from "@/lib/person-select/sharedPublic";
import { parseSelectionSyncBatch } from "@/lib/person-select/selectionSync";
import { recordSelectionSaveFailure } from "@/lib/person-select/selectionSyncServer";
import {
  loadSharedDraftSnapshot,
  saveSharedCustomerMemo,
  saveSharedFullDraft,
  saveSharedSelectionDiffs,
} from "@/lib/person-select/server/sharedDraftService";
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
      const draft = await saveSharedCustomerMemo(db, { eventId: event.id, reviewerId: reviewer.id }, customerMemo);
      return Response.json({ ok: true, draft });
    }
    if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as Record<string, unknown>).diffs)) {
      const ownedImageIds = await getSharedPersonSelectOwnedImageIds(db, event.id, body);
      let parsed: ReturnType<typeof parseSelectionSyncBatch>;
      try { parsed = parseSelectionSyncBatch(body, ownedImageIds); }
      catch (error) { throw new PublicSelectionRequestError(error instanceof Error ? error.message : "저장 요청 형식이 올바르지 않습니다."); }
      const saved = await saveSharedSelectionDiffs(db, { eventId: event.id, reviewerId: reviewer.id }, parsed);
      if (!saved.ok) {
        return Response.json({ ok: false, code: "SYNC_RETRY", error: "다른 화면의 최신 선택을 합친 뒤 다시 저장합니다.", draft: saved.draft }, { status: 409 });
      }
      return Response.json({ ok: true, draft: saved.draft });
    }
    const expectedRevision = parsePublicSelectionRevision(body);
    // Expected optimistic-lock conflicts are handled before the RPC. The RPC uses
    // PT409 for the final race check so PostgREST returns HTTP 409 without treating
    // a stale revision as a retryable serialization failure.
    const currentDraft = await loadSharedDraftSnapshot(db, { eventId: event.id, reviewerId: reviewer.id });
    const currentRevision = currentDraft.revision;
    if (currentRevision !== expectedRevision) {
      return Response.json(
        { ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다.", draft: currentDraft },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }
    const ownedImageIds = await getSharedPersonSelectOwnedImageIds(db, event.id, body);
    const parsed = parsePublicSelectionDraft(body, ownedImageIds);
    const saved = await saveSharedFullDraft(db, { eventId: event.id, reviewerId: reviewer.id }, parsed);
    if (!saved.ok) {
      return Response.json(
        { ok: false, error: "다른 화면에서 선택 내용이 변경되었습니다.", draft: saved.draft },
        { status: 409, headers: { "Retry-After": "30" } },
      );
    }
    return Response.json({ ok: true, draft: saved.draft });
  } catch (error) {
    if (failureContext) await recordSelectionSaveFailure({ db, eventId: failureContext.eventId, actorType: "reviewer", actorId: failureContext.reviewerId, error, stage: "shared_draft" });
    return publicSelectionErrorResponse(error);
  }
}
