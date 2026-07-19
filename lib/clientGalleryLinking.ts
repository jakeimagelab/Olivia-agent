import type { SupabaseClient } from "@supabase/supabase-js";

type ClientRow = { id?: unknown; hospital_name?: unknown };
type GalleryRow = { id?: unknown; hospital_name?: unknown; client_id?: unknown };

export function normalizeClientLinkName(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

export function hasUniqueClientNameMatch(rows: ClientRow[], clientId: string, hospitalName: string) {
  const normalized = normalizeClientLinkName(hospitalName);
  const matches = rows.filter((row) => normalizeClientLinkName(row.hospital_name) === normalized);
  return matches.length === 1 && String(matches[0].id) === clientId;
}

export function findLinkablePhotoGalleryIds(rows: GalleryRow[], hospitalName: string) {
  const normalized = normalizeClientLinkName(hospitalName);
  return rows
    .filter((row) => !row.client_id && normalizeClientLinkName(row.hospital_name) === normalized)
    .map((row) => String(row.id || ""))
    .filter(Boolean);
}

export async function linkUnassignedPhotoGalleries(
  db: SupabaseClient,
  input: { clientId: string; hospitalName: string; workflowRunId?: string | null },
) {
  const [clientsResult, galleriesResult] = await Promise.all([
    db.from("clients").select("id,hospital_name").limit(1_000),
    db.from("photo_galleries").select("id,hospital_name,client_id,workflow_run_id").is("client_id", null).limit(1_000),
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (galleriesResult.error) throw galleriesResult.error;
  if (!hasUniqueClientNameMatch(clientsResult.data || [], input.clientId, input.hospitalName)) {
    return { linkedIds: [] as string[], skipped: "ambiguous_client" as const };
  }

  const galleryIds = findLinkablePhotoGalleryIds(galleriesResult.data || [], input.hospitalName);
  if (galleryIds.length === 0) return { linkedIds: [] as string[], skipped: "no_match" as const };

  const { data: linkedRows, error: linkError } = await db
    .from("photo_galleries")
    .update({ client_id: input.clientId })
    .in("id", galleryIds)
    .is("client_id", null)
    .select("id");
  if (linkError) throw linkError;

  const linkedIds = (linkedRows || []).map((row) => String(row.id));
  if (input.workflowRunId && linkedIds.length > 0) {
    const { error: workflowLinkError } = await db
      .from("photo_galleries")
      .update({ workflow_run_id: input.workflowRunId })
      .in("id", linkedIds)
      .eq("client_id", input.clientId)
      .is("workflow_run_id", null);
    if (workflowLinkError) throw workflowLinkError;
  }

  return { linkedIds, skipped: null };
}
