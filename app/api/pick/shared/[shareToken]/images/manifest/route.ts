import type { NextRequest } from "next/server";
import { enforcePublicSelectionRateLimit, publicSelectionErrorResponse } from "@/lib/select-gallery/publicSelection";
import { loadPersonSelectFolderManifest } from "@/lib/person-select/server/imageRepository";
import { resolveSharedPersonSelectAccess, sharedReviewerTokenHash } from "@/lib/person-select/sharedPublic";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await context.params;
  try {
    const db = getSupabaseAdmin();
    const { event, reviewer } = await resolveSharedPersonSelectAccess(db, shareToken);
    await enforcePublicSelectionRateLimit({
      db,
      request,
      token: `${reviewer.id}:${sharedReviewerTokenHash(shareToken)}`,
      action: "person-shared-image-manifest",
      limit: 120,
      identityOnly: true,
    });
    const manifest = await loadPersonSelectFolderManifest(db, event.id);
    return Response.json({ ok: true, manifest }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
