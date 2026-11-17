#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { parse as parseExif } from "exifr";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath, toPersonSelectVirtualPath } from "@/lib/person-select/sourceRoots";
import {
  type PersonSelectDeliveryLinkMethod,
  isUnchangedDeliverySource,
  normalizeDeliveryFileName,
  nextDeliveryStatus,
  personSelectDeliveryBundleKey,
  resolveDeliveryOwner,
  resolvePersonSelectDeliveryDownloadMode,
} from "@/lib/person-select/deliveries";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

type Candidate = { absolutePath: string; relativePath: string; fileName: string; parentFolderName: string | null };
type Capture = { timestampMs: number | null; iso: string | null };
type DeliveryImportStage =
  | "source_resolve"
  | "source_scan"
  | "schema_check"
  | "project_load"
  | "selection_load"
  | "storage_prepare"
  | "existing_delivery_load"
  | "delivery_prepare"
  | "delivery_import";
type CurrentDeliveryVersion = {
  delivery_id: string;
  version: number;
  size: number | string;
  source_virtual_path: string | null;
  storage_path_original: string | null;
  uploaded_at: string;
};

const TRANSIENT_RETRY_DELAYS_MS = [500, 1_500, 3_000] as const;
let activeStage: DeliveryImportStage = "delivery_import";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message ?? "");
  return String(error);
}

function isTransientDeliveryImportError(error: unknown) {
  const message = errorMessage(error);
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : Number.NaN;
  return status === 429 || status >= 500
    || /Internal server error|fetch failed|network|ECONNRESET|ETIMEDOUT|timeout|temporar|502|503|504/iu.test(message);
}

export function isExistingStorageObjectError(error: unknown) {
  return /already exists|resource exists|duplicate/iu.test(errorMessage(error));
}

export async function retryDeliveryImportOperation<T>(
  operation: () => Promise<T>,
  wait: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDeliveryImportError(error) || attempt === TRANSIENT_RETRY_DELAYS_MS.length) throw error;
      await wait(TRANSIENT_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError;
}

async function readSupabase<T>(operation: () => PromiseLike<{ data: T; error: unknown }>) {
  return retryDeliveryImportOperation(async () => {
    const { data, error } = await operation();
    if (error) throw error;
    return data;
  });
}

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
  activeStage = "source_resolve";
  const source = await resolvePersonSelectSourcePath(input.sourceRelativePath);
  activeStage = "source_scan";
  const files = await scan(source.canonicalPath);
  const db = getSupabaseAdmin();
  activeStage = "schema_check";
  try {
    await readSupabase(() => db.from("person_select_delivery_versions").select("source_virtual_path").limit(1));
  } catch (error) {
    const message = errorMessage(error);
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
    if (/source_virtual_path|schema cache|column/i.test(`${message} ${code}`)) {
      throw new Error("보정본 전달 DB 업데이트가 필요합니다. 20261117_person_select_hybrid_delivery.sql을 먼저 적용해 주세요.");
    }
    throw error;
  }
  activeStage = "project_load";
  const event = await readSupabase(() => db.from("person_select_events")
    .select("id,title,access_mode,source_relative_path")
    .eq("id", input.eventId).single());
  if (!event) throw new Error("프로젝트를 찾을 수 없습니다.");
  const people = await readSupabase(() => db.from("person_select_people").select("id,display_name").eq("event_id", event.id));

  activeStage = "selection_load";
  const selectedRows = await retryDeliveryImportOperation(() => event.access_mode === "project_shared"
    ? readAllPersonSelectRows((from, to) => db.from("person_select_shared_selection_items")
      .select("image_id,person_select_images(id,source_rel_path)").eq("event_id", event.id).order("id").range(from, to))
    : readAllPersonSelectRows((from, to) => db.from("person_select_choices")
      .select("person_id,image_id,person_select_images(id,source_rel_path)").eq("event_id", event.id).order("id").range(from, to)));
  const selectedUnique = new Map<string, { id: string; personId: string | null; sourceRelPath: string }>();
  for (const row of selectedRows) {
    const image = row.person_select_images as unknown as { id?: string; source_rel_path?: string } | null;
    if (!image?.id || !image.source_rel_path) continue;
    selectedUnique.set(image.id, { id: image.id, personId: "person_id" in row ? String(row.person_id) : null, sourceRelPath: image.source_rel_path });
  }
  const selectedImages = [...selectedUnique.values()].map((selected) => ({
    id: selected.id,
    personId: selected.personId,
    captureTimeMs: null as number | null,
    fileName: path.basename(selected.sourceRelPath),
  }));
  if (event.source_relative_path) {
    const originalRoot = await resolvePersonSelectSourcePath(event.source_relative_path).catch(() => null);
    if (originalRoot) {
      let done = 0;
      for (const selected of selectedUnique.values()) {
        const capture = await captureTime(path.join(originalRoot.canonicalPath, ...selected.sourceRelPath.split("/")));
        const target = selectedImages.find((image) => image.id === selected.id);
        if (target) target.captureTimeMs = capture.timestampMs;
        done += 1;
        if (done % 25 === 0) progress(done, selectedUnique.size + files.length, "선택 원본의 촬영시각을 확인하고 있어요.");
      }
    }
  }

  activeStage = "storage_prepare";
  await retryDeliveryImportOperation(() => ensurePersonSelectBucket());
  activeStage = "existing_delivery_load";
  const existingData = await readSupabase(() => db.from("person_select_deliveries").select("*").eq("event_id", event.id));
  const existing = existingData ?? [];
  const currentVersionByDeliveryId = new Map<string, CurrentDeliveryVersion>();
  for (let offset = 0; offset < existing.length; offset += 200) {
    const deliveryChunk = existing.slice(offset, offset + 200);
    const currentVersionById = new Map(deliveryChunk.map((delivery) => [delivery.id, Number(delivery.current_version)]));
    const versionRows = await retryDeliveryImportOperation(() => readAllPersonSelectRows((from, to) => db
      .from("person_select_delivery_versions")
      .select("delivery_id,version,size,source_virtual_path,storage_path_original,uploaded_at")
      .in("delivery_id", deliveryChunk.map((delivery) => delivery.id))
      .order("delivery_id")
      .order("version")
      .range(from, to)));
    for (const versionRow of versionRows as CurrentDeliveryVersion[]) {
      if (Number(versionRow.version) === currentVersionById.get(versionRow.delivery_id)) {
        currentVersionByDeliveryId.set(versionRow.delivery_id, versionRow);
      }
    }
  }
  const linkPeople = (people ?? []).map((person) => ({ id: person.id, displayName: person.display_name }));
  activeStage = "delivery_prepare";
  const prepared = [] as Array<{
    file: Candidate;
    capture: Capture;
    owner: { personId: string | null; linkedImageId: string | null; method: PersonSelectDeliveryLinkMethod | null };
    normalized: string;
    groupLabel: string | null;
    previous: (typeof existing)[number] | undefined;
    bundleKey: string;
  }>;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const capture = await captureTime(file.absolutePath);
    const owner = resolveDeliveryOwner(
      { fileName: file.fileName, parentFolderName: file.parentFolderName, captureTimeMs: capture.timestampMs },
      event.access_mode === "project_shared" ? [] : linkPeople,
      selectedImages,
    );
    const normalized = normalizeDeliveryFileName(file.fileName);
    const groupLabel = event.access_mode === "project_shared" ? file.parentFolderName : owner.personId ? null : file.parentFolderName;
    const previous = existing.find((delivery) => delivery.normalized_file_name === normalized
      && ((delivery.person_id === owner.personId
        && String(delivery.group_label ?? "") === String(groupLabel ?? ""))
        || (owner.personId && !delivery.person_id && !delivery.linked_image_id)));
    prepared.push({
      file,
      capture,
      owner,
      normalized,
      groupLabel,
      previous,
      bundleKey: personSelectDeliveryBundleKey(event.access_mode, owner.personId),
    });
    if ((index + 1) % 25 === 0) progress(selectedUnique.size + index + 1, selectedUnique.size + files.length * 2, "보정본 전달 방식을 확인하고 있어요.");
  }
  const bundleEntries = new Map<string, Set<string>>();
  for (const delivery of existing) {
    const key = personSelectDeliveryBundleKey(event.access_mode, delivery.person_id);
    const entries = bundleEntries.get(key) ?? new Set<string>();
    entries.add(`existing:${delivery.id}`);
    bundleEntries.set(key, entries);
  }
  for (const item of prepared) {
    const entries = bundleEntries.get(item.bundleKey) ?? new Set<string>();
    entries.add(item.previous?.id
      ? `existing:${item.previous.id}`
      : `new:${item.owner.personId ?? "none"}:${item.groupLabel ?? ""}:${item.normalized}`);
    bundleEntries.set(item.bundleKey, entries);
  }
  const result = {
    uploadedCount: 0,
    alreadyImportedCount: 0,
    newVersionCount: 0,
    exifCount: 0,
    filenameCount: 0,
    folderCount: 0,
    unassignedCount: 0,
    storageOriginalCount: 0,
    nasOriginalCount: 0,
    unassigned: [] as Array<{ deliveryId: string; fileName: string; parentFolderName: string | null }>,
    failed: [] as Array<{ file: string; stage: string; error: string }>,
  };
  const touchedPeople = new Set<string>();
  const storage = db.storage.from(PERSON_SELECT_BUCKET);
  const uploadStorageObject = async (objectPath: string, bytes: Buffer) => {
    try {
      await readSupabase(() => storage.upload(objectPath, bytes, { contentType: "image/jpeg", upsert: false }));
      return true;
    } catch (error) {
      if (!isExistingStorageObjectError(error)) throw error;
      const existingObject = await readSupabase(() => storage.download(objectPath));
      if (!existingObject || existingObject.size !== bytes.byteLength) {
        throw new Error(`같은 저장 경로에 크기가 다른 파일이 있습니다: ${objectPath}`);
      }
      return false;
    }
  };

  activeStage = "delivery_import";
  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index];
    const { file, capture, owner, normalized, groupLabel, previous } = item;
    const createdStoragePaths: string[] = [];
    let createdDelivery = false;
    let createdVersion = false;
    let deliveryId = "";
    let version = 0;
    let fileStage = "source_check";
    try {
      deliveryId = previous?.id ?? randomUUID();
      version = previous ? Number(previous.current_version) + 1 : 1;
      const originalPath = `${event.id}/deliveries/${deliveryId}/v${version}/original.jpg`;
      const previewPath = `${event.id}/deliveries/${deliveryId}/v${version}/preview.jpg`;
      const bundleCount = bundleEntries.get(item.bundleKey)?.size ?? 0;
      const downloadMode = owner.personId || event.access_mode === "project_shared"
        ? resolvePersonSelectDeliveryDownloadMode(bundleCount)
        : "storage";
      const sourceRelativePath = [source.relativePath, file.relativePath].filter(Boolean).join("/");
      const sourceVirtualPath = toPersonSelectVirtualPath(source.root, sourceRelativePath);
      const info = await stat(file.absolutePath);
      const previousVersion = previous ? currentVersionByDeliveryId.get(previous.id) : undefined;
      if (previous && isUnchangedDeliverySource({
        sourceVirtualPath,
        size: info.size,
        modifiedAtMs: info.mtimeMs,
        previous: previousVersion ? {
          sourceVirtualPath: previousVersion.source_virtual_path,
          size: previousVersion.size,
          uploadedAt: previousVersion.uploaded_at,
        } : null,
      })) {
        fileStage = "existing_link_update";
        if (owner.personId || owner.linkedImageId) {
          await readSupabase(() => db.from("person_select_deliveries").update({
            person_id: owner.personId ?? previous.person_id,
            group_label: owner.personId ? null : groupLabel,
            linked_image_id: owner.linkedImageId ?? previous.linked_image_id,
            link_method: owner.method ?? previous.link_method,
            updated_at: new Date().toISOString(),
          }).eq("id", deliveryId).select("id"));
        }
        result.alreadyImportedCount += 1;
        if (previousVersion?.storage_path_original) result.storageOriginalCount += 1;
        else result.nasOriginalCount += 1;
        if (owner.method === "exif") result.exifCount += 1;
        else if (owner.method === "filename") result.filenameCount += 1;
        else if (owner.method === "folder") result.folderCount += 1;
        else {
          result.unassignedCount += 1;
          result.unassigned.push({ deliveryId, fileName: file.fileName, parentFolderName: file.parentFolderName });
        }
        if (owner.personId) touchedPeople.add(owner.personId);
        progress(selectedUnique.size + files.length + index + 1, selectedUnique.size + files.length * 2, `${file.fileName} · 이미 등록됨`);
        continue;
      }
      fileStage = "preview_render";
      const image = sharp(file.absolutePath, { failOn: "none" }).rotate();
      const metadata = await image.metadata();
      const preview = await image.resize({ width: 2_000, height: 2_000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      fileStage = "preview_upload";
      if (await uploadStorageObject(previewPath, preview)) createdStoragePaths.push(previewPath);
      if (downloadMode === "storage") {
        fileStage = "original_upload";
        const original = await readFile(file.absolutePath);
        if (await uploadStorageObject(originalPath, original)) createdStoragePaths.push(originalPath);
      }
      fileStage = "delivery_save";
      if (!previous) {
        await readSupabase(() => db.from("person_select_deliveries").insert({
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
        }).select("id"));
        createdDelivery = true;
      }
      await readSupabase(() => db.from("person_select_delivery_versions").insert({
        delivery_id: deliveryId,
        version,
        storage_path_original: downloadMode === "storage" ? originalPath : null,
        storage_path_preview: previewPath,
        source_virtual_path: sourceVirtualPath,
        size: info.size,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        exif_datetime: capture.iso,
        customer_memo_snapshot: previous?.customer_memo ?? "",
      }).select("id"));
      createdVersion = true;
      if (previous) {
        await readSupabase(() => db.from("person_select_deliveries").update({
          person_id: owner.personId ?? previous.person_id,
          group_label: owner.personId ? null : groupLabel,
          current_version: version,
          status: nextDeliveryStatus(previous.status, true),
          linked_image_id: owner.linkedImageId ?? previous.linked_image_id,
          link_method: owner.method ?? previous.link_method,
          updated_at: new Date().toISOString(),
        }).eq("id", deliveryId).select("id"));
        Object.assign(previous, {
          person_id: owner.personId ?? previous.person_id,
          group_label: owner.personId ? null : groupLabel,
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
      if (downloadMode === "storage") result.storageOriginalCount += 1;
      else result.nasOriginalCount += 1;
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
      result.failed.push({ file: file.relativePath, stage: fileStage, error: errorMessage(error) || "보정본 가져오기 실패" });
    }
    progress(selectedUnique.size + files.length + index + 1, selectedUnique.size + files.length * 2, file.fileName);
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

export function deliveryImportFailureOutput(error: unknown, stage: DeliveryImportStage = "delivery_import") {
  const message = errorMessage(error) || "보정본 가져오기 실패";
  return JSON.stringify({
    ok: false,
    error: /Internal server error/iu.test(message)
      ? `서버가 일시적으로 응답하지 않았습니다. 자동 재시도 후에도 실패했습니다. (${message})`
      : message,
    stage,
  });
}

if (process.env.NODE_ENV !== "test") main().catch((error) => {
  console.error(`[delivery-import:${activeStage}]`, error);
  process.stdout.write(`${deliveryImportFailureOutput(error, activeStage)}\n`);
  process.exitCode = 1;
});
