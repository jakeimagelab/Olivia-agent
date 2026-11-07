import { NextRequest } from "next/server";
import { signedImageUrls } from "@/lib/person-select/server";
import { resolveSharedPersonSelectAccess } from "@/lib/person-select/sharedPublic";
import {
  enforcePublicSelectionRateLimit,
  PublicSelectionRequestError,
  publicSelectionErrorResponse,
} from "@/lib/select-gallery/publicSelection";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ shareToken: string; imageId: string }> }) {
  const { shareToken, imageId } = await context.params;
  try {
    const db = getSupabaseAdmin();
    await enforcePublicSelectionRateLimit({ db, request, token: shareToken, action: "person-shared-image-refresh", limit: 2_000 });
    const { event } = await resolveSharedPersonSelectAccess(db, shareToken);
    const { data: image, error } = await db
      .from("person_select_images")
      .select("id,thumb_path,preview_path")
      .eq("event_id", event.id)
      .eq("id", imageId)
      .maybeSingle();
    if (error) throw error;
    if (!image) throw new PublicSelectionRequestError("사진을 찾을 수 없습니다.", 404);

    const urls = await signedImageUrls([image.thumb_path, image.preview_path], 3_600);
    return Response.json({
      ok: true,
      image: {
        id: image.id,
        thumbnail_url: urls.get(image.thumb_path) ?? "",
        image_url: urls.get(image.preview_path) ?? urls.get(image.thumb_path) ?? "",
      },
    });
  } catch (error) {
    return publicSelectionErrorResponse(error);
  }
}
