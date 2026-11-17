#!/usr/bin/env node

import { getSupabaseAdmin } from "@/lib/supabase";
import { PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { PERSON_SELECT_DOWNLOAD_BUCKET } from "@/lib/person-select/downloads";
import { selectExpiredDeliveryOwners } from "@/lib/person-select/deliveries";

async function removeOriginals(eventId: string, personId?: string) {
  const db = getSupabaseAdmin();
  let deliveryQuery = db.from("person_select_deliveries").select("id").eq("event_id", eventId);
  deliveryQuery = personId ? deliveryQuery.eq("person_id", personId) : deliveryQuery.is("person_id", null);
  const { data: deliveries, error } = await deliveryQuery;
  if (error) throw error;
  const ids = (deliveries ?? []).map((delivery) => delivery.id);
  if (!ids.length) return 0;
  const { data: versions, error: versionError } = await db.from("person_select_delivery_versions")
    .select("storage_path_original").in("delivery_id", ids);
  if (versionError) throw versionError;
  const paths = [...new Set((versions ?? []).flatMap((version) => typeof version.storage_path_original === "string" && version.storage_path_original
    ? [version.storage_path_original]
    : []))];
  for (let index = 0; index < paths.length; index += 100) {
    const { error: removeError } = await db.storage.from(PERSON_SELECT_BUCKET).remove(paths.slice(index, index + 100));
    if (removeError && !/not found/i.test(removeError.message)) throw removeError;
  }
  return paths.length;
}

async function removeDeliveryArchives(eventId: string, personId?: string) {
  const db = getSupabaseAdmin();
  const prefix = `deliveries/${eventId}/${personId ?? "shared"}`;
  const { data, error } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).list(prefix, { limit: 1_000 });
  if (error && !/not found/i.test(error.message)) throw error;
  const paths = (data ?? []).filter((item) => item.name.endsWith(".zip")).map((item) => `${prefix}/${item.name}`);
  if (paths.length) {
    const { error: removeError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).remove(paths);
    if (removeError && !/not found/i.test(removeError.message)) throw removeError;
  }
  return paths.length;
}

async function main() {
  const db = getSupabaseAdmin();
  const { data: events, error } = await db.from("person_select_events")
    .select("id,access_mode,delivery_retention_days,delivery_approved_at,delivery_retention_extended_until,delivery_files_purged_at");
  if (error) throw error;
  const { data: people, error: peopleError } = await db.from("person_select_people")
    .select("id,event_id,delivery_approved_at,delivery_retention_extended_until,delivery_files_purged_at");
  if (peopleError) throw peopleError;
  const retentionByEvent = new Map((events ?? []).map((event) => [event.id, Number(event.delivery_retention_days) || 30]));
  const expiredEvents = selectExpiredDeliveryOwners((events ?? []).filter((event) => event.access_mode === "project_shared").map((event) => ({
    id: event.id,
    approvedAt: event.delivery_approved_at,
    retentionDays: Number(event.delivery_retention_days) || 30,
    extendedUntil: event.delivery_retention_extended_until,
    purgedAt: event.delivery_files_purged_at,
  })));
  const expiredPeople = selectExpiredDeliveryOwners((people ?? []).map((person) => ({
    id: person.id,
    eventId: person.event_id,
    approvedAt: person.delivery_approved_at,
    retentionDays: retentionByEvent.get(person.event_id) ?? 30,
    extendedUntil: person.delivery_retention_extended_until,
    purgedAt: person.delivery_files_purged_at,
  })));
  let deletedCount = 0;
  const now = new Date().toISOString();
  for (const event of expiredEvents) {
    deletedCount += await removeOriginals(event.id);
    deletedCount += await removeDeliveryArchives(event.id);
    await db.from("person_select_events").update({ delivery_files_purged_at: now, updated_at: now }).eq("id", event.id);
  }
  for (const person of expiredPeople) {
    deletedCount += await removeOriginals(person.eventId, person.id);
    deletedCount += await removeDeliveryArchives(person.eventId, person.id);
    await db.from("person_select_people").update({ delivery_files_purged_at: now, updated_at: now }).eq("id", person.id);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, purgedProjects: expiredEvents.length, purgedPeople: expiredPeople.length, deletedCount })}\n`);
}

if (process.env.NODE_ENV !== "test") main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "보정본 보관 정리 실패", stage: "delivery_purge" })}\n`);
  process.exitCode = 1;
});
