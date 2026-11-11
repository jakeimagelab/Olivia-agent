#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { parse as parseExif } from "exifr";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { normalizeDeliveryFileName, nextDeliveryStatus, resolveDeliveryOwner } from "@/lib/person-select/deliveries";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

type Candidate = { absolutePath: string; relativePath: string; fileName: string; parentFolderName: string | null };
type Capture = { timestampMs: number | null; iso: string | null };

function args() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const index = values.indexOf(flag); return index >= 0 ? values[index + 1] : undefined; };
  return { eventId: take("--event-id"), sourceRelativePath: take("--source-relative-path") };
}

function progress(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "DELIVERY_IMPORT", current, total, message })}\n`);
}

async function scan(root: string) {
  const output: Candidate[] = [];
  async function visit(folder: string): Promise<void> {
    const entries = await readdir(folder, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(absolutePath); continue; }
      if (!entry.isFile() || !/\.jpe?g$/iu.test(entry.name)) continue;
      const parent = path.basename(path.dirname(absolutePath));
      output.push({
        absolutePath,
        relativePath: path.relative(root, absolutePath).split(path.sep).join("/").normalize("NFC"),
        fileName: entry.name.normalize("NFC"),
        parentFolderName: parent === path.basename(root) ? null : parent.normalize("NFC"),
      });
    }
  }
  await visit(root);
  return output.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "ko", { numeric: true }));
}

function timestamp(value: unknown, subsec: unknown): Capture {
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return { timestampMs: null, iso: null };
  let ms = date.getTime();
  if (typeof subsec === "string" && /^\d+$/u.test(subsec.trim())) {
    ms = Math.floor(ms / 1_000) * 1_000 + Number(`0.${subsec.trim()}`) * 1_000;
  }
  return { timestampMs: Math.round(ms), iso: new Date(Math.round(ms)).toISOString() };
}

async function captureTime(filePath: string): Promise<Capture> {
  try {
    const metadata = await parseExif(filePath, ["DateTimeOriginal", "SubSecTimeOriginal"]) as Record<string, unknown> | undefined;
    return timestamp(metadata?.DateTimeOriginal, metadata?.SubSecTimeOriginal);
  } catch { return { timestampMs: null, iso: null }; }
}

async function main() {
  const input = args();
  if (!input.eventId || !input.sourceRelativePath) throw new Error("event_id와 보정본 폴더가 필요합니다.");
  const source = await resolvePersonSelectSourcePath(input.sourceRelativePath);
  const files = await scan(source.canonicalPath);
  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events")
    .select("id,title,access_mode,source_relative_path")
    .eq("id", input.eventId).single();
  if (eventError || !event) throw new Error(eventError?.message || "프로젝트를 찾을 수 없습니다.");
  const { data: people, error: peopleError } = await db.from("person_select_people").select("id,display_name").eq("event_id", event.id);
  if (peopleError) throw peopleError;

  const selectedRows = event.access_mode === "project_shared"
    ? await readAllPersonSelectRows((from, to) => db.from("person_select_shared_selection_items")
      .select("image_id,person_select_images(id,source_rel_path)").eq("event_id", event.id).order("id").range(from, to))
    : await readAllPersonSelectRows((from, to) => db.from("person_select_choices")
      .select("person_id,image_id,person_select_images(id,source_rel_path)").eq("event_id", event.id).order("id").range(from, to));
  const selectedUnique = new Map<string, { id: string; personId: string | null; sourceRelPath: string }>();
  for (const row of selectedRows) {
    const image = row.person_select_images as unknown as { id?: string; source_rel_path?: string } | null;
    if (!image?.id || !image.source_rel_path) continue;
    selectedUnique.set(image.id, { id: image.id, personId: "person_id" in row ? String(row.person_id) : null, sourceRelPath: image.source_rel_path });
  }
  const selectedImages: Array<{ id: string; personId: string | null; captureTimeMs: number | null }> = [];
  if (event.source_relative_path) {
    const originalRoot = await resolvePersonSelectSourcePath(event.source_relative_path).catch(() => null);
    if (originalRoot) {
      let done = 0;
      for (const selected of selectedUnique.values()) {
        const capture = await captureTime(path.join(originalRoot.canonicalPath, ...selected.sourceRelPath.split("/")));
        selectedImages.push({ id: selected.id, personId: selected.personId, captureTimeMs: capture.timestampMs });
        done += 1;
        if (done % 25 === 0) progress(done, selectedUnique.size + files.length, "선택 원본의 촬영시각을 확인하고 있어요.");
      }
    }
  }

  await ensurePersonSelectBucket();
  const { data: existingData, error: existingError } = await db.from("person_select_deliveries").select("*").eq("event_id", event.id);
  if (existingError) throw existingError;
  const existing = existingData ?? [];
  const result = {
    uploadedCount: 0,
    newVersionCount: 0,
    exifCount: 0,
    filenameCount: 0,
    folderCount: 0,
    unassignedCount: 0,
    unassigned: [] as Array<{ deliveryId: string; fileName: string; parentFolderName: string | null }>,
    failed: [] as Array<{ file: string; error: string }>,
  };
  const touchedPeople = new Set<string>();
  const storage = db.storage.from(PERSON_SELECT_BUCKET);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const createdStoragePaths: string[] = [];
    let createdDelivery = false;
    let createdVersion = false;
    let deliveryId = "";
    let version = 0;
    try {
      const capture = await captureTime(file.absolutePath);
      const owner = event.access_mode === "project_shared"
        ? (() => {
          const matches = selectedImages.filter((image) => capture.timestampMs !== null && image.captureTimeMs !== null && Math.abs(image.captureTimeMs - capture.timestampMs) <= 2_000);
          return matches.length === 1 ? { personId: null, linkedImageId: matches[0].id, method: "exif" as const } : { personId: null, linkedImageId: null, method: null };
        })()
        : resolveDeliveryOwner({ fileName: file.fileName, parentFolderName: file.parentFolderName, captureTimeMs: capture.timestampMs }, (people ?? []).map((person) => ({ id: person.id, displayName: person.display_name })), selectedImages);
      const normalized = normalizeDeliveryFileName(file.fileName);
      const groupLabel = event.access_mode === "project_shared" ? file.parentFolderName : owner.personId ? null : file.parentFolderName;
      const previous = existing.find((delivery) => delivery.person_id === owner.personId
        && String(delivery.group_label ?? "") === String(groupLabel ?? "")
        && delivery.normalized_file_name === normalized);
      deliveryId = previous?.id ?? randomUUID();
      version = previous ? Number(previous.current_version) + 1 : 1;
      const originalPath = `${event.id}/deliveries/${deliveryId}/v${version}/original.jpg`;
      const previewPath = `${event.id}/deliveries/${deliveryId}/v${version}/preview.jpg`;
      const bytes = await readFile(file.absolutePath);
      const image = sharp(bytes, { failOn: "none" }).rotate();
      const metadata = await image.metadata();
      const preview = await image.resize({ width: 2_000, height: 2_000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      const [originalUpload, previewUpload] = await Promise.all([
        storage.upload(originalPath, bytes, { contentType: "image/jpeg", upsert: false }),
        storage.upload(previewPath, preview, { contentType: "image/jpeg", upsert: false }),
      ]);
      if (originalUpload.error || previewUpload.error) {
        await storage.remove([originalPath, previewPath]);
        throw originalUpload.error || previewUpload.error;
      }
      createdStoragePaths.push(originalPath, previewPath);
      const info = await stat(file.absolutePath);
      if (!previous) {
        const { error } = await db.from("person_select_deliveries").insert({
          id: deliveryId,
          event_id: event.id,
          person_id: owner.personId,
          group_label: groupLabel,
          display_name: file.fileName,
          normalized_file_name: normalized,
          sort_order: index,
          current_version: version,
          status: "pending",
          linked_image_id: owner.linkedImageId,
          link_method: owner.method,
        });
        if (error) throw error;
        createdDelivery = true;
      }
      const { error: versionError } = await db.from("person_select_delivery_versions").insert({
        delivery_id: deliveryId,
        version,
        storage_path_original: originalPath,
        storage_path_preview: previewPath,
        size: info.size,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        exif_datetime: capture.iso,
        customer_memo_snapshot: previous?.customer_memo ?? "",
      });
      if (versionError) throw versionError;
      createdVersion = true;
      if (previous) {
        const { error } = await db.from("person_select_deliveries").update({
          current_version: version,
          status: nextDeliveryStatus(previous.status, true),
          linked_image_id: owner.linkedImageId ?? previous.linked_image_id,
          link_method: owner.method ?? previous.link_method,
          updated_at: new Date().toISOString(),
        }).eq("id", deliveryId);
        if (error) throw error;
        Object.assign(previous, {
          current_version: version,
          status: nextDeliveryStatus(previous.status, true),
          linked_image_id: owner.linkedImageId ?? previous.linked_image_id,
          link_method: owner.method ?? previous.link_method,
        });
        result.newVersionCount += 1;
      } else {
        existing.push({
          id: deliveryId,
          event_id: event.id,
          person_id: owner.personId,
          group_label: groupLabel,
          display_name: file.fileName,
          normalized_file_name: normalized,
          current_version: version,
          status: "pending",
          customer_memo: "",
          linked_image_id: owner.linkedImageId,
          link_method: owner.method,
        });
      }
      result.uploadedCount += 1;
      if (owner.method === "exif") result.exifCount += 1;
      else if (owner.method === "filename") result.filenameCount += 1;
      else if (owner.method === "folder") result.folderCount += 1;
      else {
        result.unassignedCount += 1;
        result.unassigned.push({ deliveryId, fileName: file.fileName, parentFolderName: file.parentFolderName });
      }
      if (owner.personId) touchedPeople.add(owner.personId);
    } catch (error) {
      if (createdStoragePaths.length) await storage.remove(createdStoragePaths).catch(() => undefined);
      if (createdVersion && deliveryId) {
        try { await db.from("person_select_delivery_versions").delete().eq("delivery_id", deliveryId).eq("version", version); }
        catch (cleanupError) { console.error(`[delivery-import] 버전 롤백 실패: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`); }
      }
      if (createdDelivery && deliveryId) {
        try { await db.from("person_select_deliveries").delete().eq("id", deliveryId); }
        catch (cleanupError) { console.error(`[delivery-import] 보정본 행 롤백 실패: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`); }
      }
      result.failed.push({ file: file.relativePath, error: error instanceof Error ? error.message : "보정본 가져오기 실패" });
    }
    progress(selectedUnique.size + index + 1, selectedUnique.size + files.length, file.fileName);
  }

  const now = new Date().toISOString();
  if (event.access_mode === "project_shared" && result.uploadedCount > 0) {
    await db.from("person_select_events").update({ delivery_state: "reviewing", updated_at: now }).eq("id", event.id).neq("delivery_state", "approved");
  } else if (touchedPeople.size) {
    await db.from("person_select_people").update({ delivery_state: "reviewing", updated_at: now }).in("id", [...touchedPeople]).neq("delivery_state", "approved");
  }
  const output = { ok: result.failed.length === 0, eventId: event.id, totalCount: files.length, ...result };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (result.failed.length) process.exitCode = 1;
}

export function deliveryImportFailureOutput(error: unknown) {
  return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "보정본 가져오기 실패", stage: "delivery_import" });
}

if (process.env.NODE_ENV !== "test") main().catch((error) => {
  process.stdout.write(`${deliveryImportFailureOutput(error)}\n`);
  process.exitCode = 1;
});
