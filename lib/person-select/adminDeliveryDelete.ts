import type { SupabaseClient } from "@supabase/supabase-js";

import { PERSON_SELECT_BUCKET } from "./server";

type AdminDeliveryRow = {
  id: string;
  event_id: string;
  person_id: string | null;
  display_name: string;
};

type DeliveryVersionPaths = {
  storage_path_original: string | null;
  storage_path_preview: string | null;
};

export class AdminDeliveryNotFoundError extends Error {
  constructor() {
    super("보정본을 찾을 수 없습니다.");
    this.name = "AdminDeliveryNotFoundError";
  }
}
export function collectDeliveryStoragePaths(versions: readonly DeliveryVersionPaths[]) {
  return [...new Set(versions.flatMap((version) => [
    version.storage_path_original,
    version.storage_path_preview,
  ]).filter((path): path is string => typeof path === "string" && Boolean(path.trim())))];
}

async function resetOwnerStateIfEmpty(db: SupabaseClient, delivery: AdminDeliveryRow) {
  if (!delivery.person_id) return null;
  const { count, error: countError } = await db.from("person_select_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("event_id", delivery.event_id)
    .eq("person_id", delivery.person_id);
  if (countError) return countError.message;
  if ((count ?? 0) > 0) return null;
  const { error: updateError } = await db.from("person_select_people").update({
    delivery_state: "none",
    delivery_approved_at: null,
    delivery_downloaded_at: null,
    delivery_files_purged_at: null,
    delivery_retention_extended_until: null,
    updated_at: new Date().toISOString(),
  }).eq("event_id", delivery.event_id).eq("id", delivery.person_id);
  return updateError?.message ?? null;
}

export async function deleteAdminDelivery(
  db: SupabaseClient,
  scope: { eventId: string; deliveryId: string },
) {
  const { data, error: deliveryError } = await db.from("person_select_deliveries")
    .select("id,event_id,person_id,display_name")
    .eq("event_id", scope.eventId)
    .eq("id", scope.deliveryId)
    .maybeSingle();
  if (deliveryError) throw deliveryError;
  if (!data) throw new AdminDeliveryNotFoundError();
  const delivery = data as AdminDeliveryRow;

  const { data: versionData, error: versionError } = await db.from("person_select_delivery_versions")
    .select("storage_path_original,storage_path_preview")
    .eq("delivery_id", delivery.id);
  if (versionError) throw versionError;
  const storagePaths = collectDeliveryStoragePaths((versionData ?? []) as DeliveryVersionPaths[]);

  if (storagePaths.length) {
    const { error: storageError } = await db.storage.from(PERSON_SELECT_BUCKET).remove(storagePaths);
    if (storageError) throw new Error(`보정본 파일을 삭제하지 못했습니다: ${storageError.message}`);
  }

  const { data: deleted, error: deleteError } = await db.from("person_select_deliveries")
    .delete()
    .eq("event_id", scope.eventId)
    .eq("id", scope.deliveryId)
    .select("id")
    .maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) throw new AdminDeliveryNotFoundError();

  const stateCleanupWarning = await resetOwnerStateIfEmpty(db, delivery);
  return {
    id: delivery.id,
    displayName: delivery.display_name,
    removedFileCount: storagePaths.length,
    stateCleanupWarning,
  };
}
