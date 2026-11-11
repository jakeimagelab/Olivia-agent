import type { SupabaseClient } from "@supabase/supabase-js";
import { PERSON_SELECT_BUCKET, signedImageUrls } from "./server";
import { deliveryExpiresAt, isDeliveryExpired } from "./deliveries";

export type DeliveryOwnerState = {
  delivery_state?: string | null;
  delivery_approved_at?: string | null;
  delivery_downloaded_at?: string | null;
  delivery_files_purged_at?: string | null;
  delivery_retention_extended_until?: string | null;
};

type DeliveryRow = {
  id: string;
  event_id: string;
  person_id: string | null;
  group_label: string | null;
  display_name: string;
  sort_order: number;
  current_version: number;
  status: "pending" | "revision_requested" | "revised" | "approved";
  customer_memo: string;
  linked_image_id: string | null;
  link_method: string | null;
  updated_at: string;
};

type DeliveryVersionRow = {
  delivery_id: string;
  version: number;
  storage_path_original: string;
  storage_path_preview: string;
  size: number;
  width: number | null;
  height: number | null;
  exif_datetime: string | null;
  uploaded_at: string;
  customer_memo_snapshot: string;
};

export async function loadDeliveryItems(
  db: SupabaseClient,
  scope: { eventId: string; personId?: string | null },
  options?: { includeVersions?: boolean },
) {
  let deliveryQuery = db.from("person_select_deliveries")
    .select("id,event_id,person_id,group_label,display_name,sort_order,current_version,status,customer_memo,linked_image_id,link_method,updated_at")
    .eq("event_id", scope.eventId)
    .order("sort_order")
    .order("id");
  deliveryQuery = scope.personId ? deliveryQuery.eq("person_id", scope.personId) : deliveryQuery.is("person_id", null);
  const { data: deliveryData, error: deliveryError } = await deliveryQuery;
  if (deliveryError) throw deliveryError;
  const deliveries = (deliveryData ?? []) as DeliveryRow[];
  if (!deliveries.length) return [];

  const { data: versionData, error: versionError } = await db.from("person_select_delivery_versions")
    .select("delivery_id,version,storage_path_original,storage_path_preview,size,width,height,exif_datetime,uploaded_at,customer_memo_snapshot")
    .in("delivery_id", deliveries.map((delivery) => delivery.id))
    .order("version", { ascending: false });
  if (versionError) throw versionError;
  const versions = (versionData ?? []) as DeliveryVersionRow[];
  const currentPreviewPaths = deliveries.flatMap((delivery) => {
    const version = versions.find((item) => item.delivery_id === delivery.id && item.version === delivery.current_version);
    return version?.storage_path_preview ? [version.storage_path_preview] : [];
  });
  const previewUrls = await signedImageUrls(currentPreviewPaths, 3_600);

  return deliveries.map((delivery) => {
    const itemVersions = versions.filter((version) => version.delivery_id === delivery.id);
    const current = itemVersions.find((version) => version.version === delivery.current_version) ?? null;
    return {
      ...delivery,
      preview_url: current ? previewUrls.get(current.storage_path_preview) ?? "" : "",
      width: current?.width ?? null,
      height: current?.height ?? null,
      size: current?.size ?? 0,
      uploaded_at: current?.uploaded_at ?? null,
      versions: options?.includeVersions ? itemVersions.map((version) => ({
        version: version.version,
        uploaded_at: version.uploaded_at,
        customer_memo_snapshot: version.customer_memo_snapshot,
      })) : undefined,
    };
  });
}

export async function loadAdminDeliveryItems(db: SupabaseClient, eventId: string) {
  const { data, error } = await db.from("person_select_deliveries")
    .select("id,event_id,person_id,group_label,display_name,sort_order,current_version,status,customer_memo,linked_image_id,link_method,updated_at")
    .eq("event_id", eventId)
    .order("sort_order")
    .order("id");
  if (error && /person_select_deliveries|schema cache|does not exist/i.test(`${error.message} ${error.code ?? ""}`)) return [];
  if (error) throw error;
  const deliveries = (data ?? []) as DeliveryRow[];
  if (!deliveries.length) return [];
  const { data: versionData, error: versionError } = await db.from("person_select_delivery_versions")
    .select("delivery_id,version,storage_path_original,storage_path_preview,size,width,height,exif_datetime,uploaded_at,customer_memo_snapshot")
    .in("delivery_id", deliveries.map((delivery) => delivery.id))
    .order("version", { ascending: false });
  if (versionError) throw versionError;
  const versions = (versionData ?? []) as DeliveryVersionRow[];
  const currentPaths = deliveries.flatMap((delivery) => {
    const version = versions.find((item) => item.delivery_id === delivery.id && item.version === delivery.current_version);
    return version?.storage_path_preview ? [version.storage_path_preview] : [];
  });
  const urls = await signedImageUrls(currentPaths, 3_600);
  return deliveries.map((delivery) => {
    const itemVersions = versions.filter((version) => version.delivery_id === delivery.id);
    const current = itemVersions.find((version) => version.version === delivery.current_version) ?? null;
    return {
      ...delivery,
      preview_url: current ? urls.get(current.storage_path_preview) ?? "" : "",
      versions: itemVersions.map((version) => ({
        version: version.version,
        uploaded_at: version.uploaded_at,
        customer_memo_snapshot: version.customer_memo_snapshot,
      })),
    };
  });
}

export function deliveryAccessSummary(input: {
  owner: DeliveryOwnerState;
  retentionDays: number;
  nowMs?: number;
}) {
  const expiresAt = deliveryExpiresAt({
    approvedAt: input.owner.delivery_approved_at,
    retentionDays: input.retentionDays,
    extendedUntil: input.owner.delivery_retention_extended_until,
  });
  const expired = isDeliveryExpired({
    approvedAt: input.owner.delivery_approved_at,
    retentionDays: input.retentionDays,
    extendedUntil: input.owner.delivery_retention_extended_until,
  }, input.nowMs);
  return {
    state: input.owner.delivery_state ?? "none",
    approvedAt: input.owner.delivery_approved_at ?? null,
    downloadedAt: input.owner.delivery_downloaded_at ?? null,
    filesPurgedAt: input.owner.delivery_files_purged_at ?? null,
    expiresAt,
    expired: expired || Boolean(input.owner.delivery_files_purged_at),
    downloadAvailable: input.owner.delivery_state === "approved"
      && !expired
      && !input.owner.delivery_files_purged_at,
  };
}

export async function createDeliveryDownloadUrls(
  db: SupabaseClient,
  scope: { eventId: string; personId?: string | null },
) {
  const items = await loadDeliveryItems(db, scope);
  if (!items.length) return [];
  const { data: versions, error } = await db.from("person_select_delivery_versions")
    .select("delivery_id,version,storage_path_original")
    .in("delivery_id", items.map((item) => item.id));
  if (error) throw error;
  const currentPaths = new Map((versions ?? []).map((version) => [`${version.delivery_id}:${version.version}`, version.storage_path_original]));
  const bucket = db.storage.from(PERSON_SELECT_BUCKET);
  const output: Array<{ id: string; fileName: string; url: string }> = [];
  for (const item of items) {
    const storagePath = currentPaths.get(`${item.id}:${item.current_version}`);
    if (!storagePath) continue;
    const { data, error: signError } = await bucket.createSignedUrl(storagePath, 600, { download: item.display_name });
    if (signError) throw signError;
    output.push({ id: item.id, fileName: item.display_name, url: data.signedUrl });
  }
  return output;
}
