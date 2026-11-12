import { NextRequest } from "next/server";
import { eventIsLocked, validateChoiceInput } from "@/lib/person-select/core";
import { getPublicSessionContext } from "@/lib/person-select/server";
import { parseSelectionSyncBatch } from "@/lib/person-select/selectionSync";
import { recordSelectionSaveFailure } from "@/lib/person-select/selectionSyncServer";
import { loadPersonChoiceSnapshot, savePersonChoiceDiffs } from "@/lib/person-select/server/personChoiceSyncService";
import { enforcePublicSelectionRateLimit, getOwnedSelectionImageIds, PublicSelectionRequestError, publicSelectionErrorResponse, readPublicSelectionJson } from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const preferredRegion = ["icn1"];

export async function GET(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  const db = getSupabaseAdmin();
  try {
    await enforcePublicSelectionRateLimit({ db, request, token: `${ctx.event.id}:${ctx.person.id}`, action: "person-choice-sync-read", limit: 120, identityOnly: true });
    return Response.json({ ok: true, snapshot: await loadPersonChoiceSnapshot(db, ctx.event.id, ctx.person.id) });
  } catch (error) { return publicSelectionErrorResponse(error); }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await context.params;
  const ctx = await getPublicSessionContext(request, eventSlug);
  if (!ctx) return Response.json({ ok: false, error: "다시 로그인해 주세요." }, { status: 401 });
  if (eventIsLocked(ctx.event)) return Response.json({ ok: false, error: "선택이 마감됐어요." }, { status: 423 });
  const db = getSupabaseAdmin();
  try {
    await enforcePublicSelectionRateLimit({ db, request, token: `${ctx.event.id}:${ctx.person.id}`, action: "person-choice-batch", limit: 60, identityOnly: true });
    const body = await readPublicSelectionJson(request);
    const owned = await getOwnedSelectionImageIds(db, { table: "person_select_images", ownerColumn: "event_id", ownerId: ctx.event.id }, body);
    let parsed: ReturnType<typeof parseSelectionSyncBatch>;
    try { parsed = parseSelectionSyncBatch(body, owned); }
    catch (error) { throw new PublicSelectionRequestError(error instanceof Error ? error.message : "저장 요청 형식이 올바르지 않습니다."); }
    for (const diff of parsed.diffs) {
      if (Object.prototype.hasOwnProperty.call(diff, "memo") || Object.prototype.hasOwnProperty.call(diff, "retouchKeys")) {
        const validation = validateChoiceInput({
          retouchKeys: diff.retouchKeys ?? [],
          memo: diff.memo ?? "",
          allowedKeys: ctx.event.retouch_options.map((item) => item.key),
          memoMax: ctx.event.memo_max,
        });
        if (validation) throw new PublicSelectionRequestError(validation);
      }
    }
    const snapshot = await savePersonChoiceDiffs(db, ctx.event, ctx.person, parsed);
    return Response.json({ ok: true, snapshot });
  } catch (error) {
    await recordSelectionSaveFailure({ db, eventId: ctx.event.id, actorType: "person", actorId: ctx.person.id, error, stage: "person_choice_batch" });
    return publicSelectionErrorResponse(error);
  }
}
