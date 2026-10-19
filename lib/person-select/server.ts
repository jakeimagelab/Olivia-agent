import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sessionFromRequest } from "./session";
import type { PersonSelectEvent, PersonSelectPerson } from "./types";
import { canAccessImageRecord } from "./core";

export const PERSON_SELECT_BUCKET = "person-select";

export async function ensurePersonSelectBucket() {
  const storage = getSupabaseAdmin().storage;
  const { data } = await storage.getBucket(PERSON_SELECT_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(PERSON_SELECT_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

export async function signedImageUrl(path: string, expiresIn = 600) {
  const { data, error } = await getSupabaseAdmin().storage.from(PERSON_SELECT_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedImageUrls(paths: string[], expiresIn = 600) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map<string, string>();
  const { data, error } = await getSupabaseAdmin().storage.from(PERSON_SELECT_BUCKET).createSignedUrls(uniquePaths, expiresIn);
  if (error) throw error;
  if (!data || data.length !== uniquePaths.length) throw new Error("사진 주소를 모두 만들지 못했어요.");
  return new Map(uniquePaths.map((path, index) => [path, data[index]?.signedUrl ?? ""]));
}

export async function getPublicSessionContext(request: NextRequest, slug: string) {
  const session = sessionFromRequest(request);
  if (!session) return null;
  const db = getSupabaseAdmin();
  const [{ data: event }, { data: person }] = await Promise.all([
    db.from("person_select_events").select("*").eq("id", session.eventId).eq("slug", slug).maybeSingle(),
    db.from("person_select_people").select("id,event_id,display_name,login_name,group_label,first_seen_at,last_seen_at,submitted_at").eq("id", session.personId).eq("event_id", session.eventId).maybeSingle(),
  ]);
  if (!event || !person) return null;
  return { event: event as PersonSelectEvent, person: person as PersonSelectPerson };
}

export async function imageBelongsToPerson(input: {
  imageId: string;
  categoryKey: string;
  eventId: string;
  personId: string;
  groupLabel: string | null;
}) {
  const { data } = await getSupabaseAdmin()
    .from("person_select_images")
    .select("id,event_id,category_key,owner_person_id,owner_group")
    .eq("id", input.imageId)
    .eq("event_id", input.eventId)
    .eq("category_key", input.categoryKey)
    .maybeSingle();
  if (!data) return false;
  return canAccessImageRecord({
    personId: input.personId,
    groupLabel: input.groupLabel,
    categoryKey: input.categoryKey,
    imageOwnerPersonId: data.owner_person_id,
    imageOwnerGroup: data.owner_group,
  });
}
