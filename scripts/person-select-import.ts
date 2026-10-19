#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createUniquePin, normalizeLoginName, normalizeNfc, parseGroupFolderName, parsePersonFolderName } from "@/lib/person-select/core";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";

type Mapping = { folder: string; category: string; owner: "person" | "group" };
type Candidate = { absolutePath: string; relPath: string; fileName: string; category: string; ownerName: string | null; ownerGroup: string | null };

function readArgs() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const i = values.indexOf(flag); return i >= 0 ? values[i + 1] : undefined; };
  const rawMaps = values.flatMap((value, i) => value === "--map" && values[i + 1] ? [values[i + 1]] : []);
  const mappingsJson = take("--mappings-json");
  const mappings: Mapping[] = mappingsJson ? JSON.parse(mappingsJson) : rawMaps.map((value) => {
    const [folder, rule] = value.split("="); const [category, owner] = (rule ?? "").split(":");
    if (!folder || !category || !["person", "group"].includes(owner)) throw new Error(`올바르지 않은 --map 값입니다: ${value}`);
    return { folder, category, owner: owner as "person" | "group" };
  });
  return { eventSlug: take("--event"), eventId: take("--event-id"), root: take("--root"), sourceRelativePath: take("--source-relative-path"), mappings, dryRun: values.includes("--dry-run") };
}

function report(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "PREPARING", current, total, message })}\n`);
}

export async function scanPersonSelectFolders(root: string, mappings: Mapping[]) {
  const files: Candidate[] = [];
  for (const mapping of mappings) {
    const categoryRoot = path.join(root, mapping.folder);
    let dirs: Dirent<string>[];
    try { dirs = await readdir(categoryRoot, { withFileTypes: true, encoding: "utf8" }); } catch { continue; }
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
      const ownerName = mapping.owner === "person" ? parsePersonFolderName(dir.name, mapping.folder) : null;
      const ownerGroup = mapping.owner === "group" ? parseGroupFolderName(dir.name, mapping.folder) : null;
      const folder = path.join(categoryRoot, dir.name);
      for (const entry of await readdir(folder, { withFileTypes: true, encoding: "utf8" })) {
        if (!entry.isFile() || entry.name.startsWith(".") || !/\.jpe?g$/i.test(entry.name)) continue;
        files.push({ absolutePath: path.join(folder, entry.name), relPath: normalizeNfc(path.relative(root, path.join(folder, entry.name)).split(path.sep).join("/")), fileName: normalizeNfc(entry.name), category: mapping.category, ownerName: ownerName ? normalizeNfc(ownerName) : null, ownerGroup });
      }
    }
  }
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath, "ko"));
}

/** 매핑되지 않은 학생사진은 절대 순회하지 않고, 결과 안내에만 남긴다. */
export async function findSkippedFolders(root: string, mappings: Mapping[]) {
  const mapped = new Set(mappings.map((mapping) => normalizeNfc(mapping.folder)));
  try {
    const entries = await readdir(root, { withFileTypes: true, encoding: "utf8" });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !mapped.has(normalizeNfc(entry.name)))
      .map((entry) => normalizeNfc(entry.name));
  } catch {
    return [];
  }
}

async function main() {
  const input = readArgs();
  if (!input.mappings.length) throw new Error("가져오기 항목 매핑이 필요합니다.");
  const root = input.root
    ? (await resolvePersonSelectSourcePath(input.root)).canonicalPath
    : (await resolvePersonSelectSourcePath(input.sourceRelativePath ?? "")).canonicalPath;
  const db = getSupabaseAdmin();
  const query = db.from("person_select_events").select("id,slug");
  const { data: event, error: eventError } = input.eventId ? await query.eq("id", input.eventId).single() : await query.eq("slug", input.eventSlug ?? "").single();
  if (eventError || !event) throw new Error(eventError?.message || "행사를 찾을 수 없습니다.");
  const eventId = event.id;
  const files = await scanPersonSelectFolders(root, input.mappings);
  const skippedFolders = await findSkippedFolders(root, input.mappings);
  const peopleNames = [...new Set(files.map((file) => file.ownerName).filter((value): value is string => Boolean(value)))];
  if (input.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, root, photoCount: files.length, people: peopleNames, skippedFolders, byCategory: Object.fromEntries(input.mappings.map((item) => [item.category, files.filter((file) => file.category === item.category).length])) })}\n`);
    return;
  }
  await ensurePersonSelectBucket();
  const { data: currentPeople } = await db.from("person_select_people").select("id,display_name,login_name,pin_code").eq("event_id", eventId);
  const people = new Map((currentPeople ?? []).map((person) => [person.login_name, person]));
  const usedPins = new Set((currentPeople ?? []).map((person) => person.pin_code));
  const createdPeople: { name: string; pin: string }[] = [];
  for (const displayName of peopleNames) {
    const loginName = normalizeLoginName(displayName); if (people.has(loginName)) continue;
    const pin = createUniquePin(usedPins); usedPins.add(pin);
    const { data: person, error } = await db.from("person_select_people").insert({ event_id: eventId, display_name: displayName, login_name: loginName, pin_code: pin }).select("id,display_name,login_name,pin_code").single();
    if (error) throw error;
    people.set(loginName, person); createdPeople.push({ name: displayName, pin });
  }
  const { data: existingRows } = await db.from("person_select_images").select("source_rel_path").eq("event_id", eventId);
  const existing = new Set((existingRows ?? []).map((row) => row.source_rel_path));
  const pending = files.filter((file) => !existing.has(file.relPath));
  const failed: { file: string; reason: string }[] = [];
  let imported = 0; let cursor = 0;
  report(0, pending.length, "사진 가져오기를 시작합니다.");
  async function worker() {
    while (true) {
      const index = cursor++; const file = pending[index]; if (!file) return;
      try {
        const imageId = randomUUID(); const image = sharp(file.absolutePath, { failOn: "none" }).rotate(); const metadata = await image.metadata();
        const thumb = await image.clone().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
        const preview = await image.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
        const thumbPath = `${eventId}/${imageId}_thumb.jpg`; const previewPath = `${eventId}/${imageId}_preview.jpg`; const storage = db.storage.from(PERSON_SELECT_BUCKET);
        const [a, b] = await Promise.all([storage.upload(thumbPath, thumb, { contentType: "image/jpeg" }), storage.upload(previewPath, preview, { contentType: "image/jpeg" })]);
        if (a.error || b.error) throw a.error || b.error;
        const owner = file.ownerName ? people.get(normalizeLoginName(file.ownerName)) : null;
        const { error } = await db.from("person_select_images").insert({ id: imageId, event_id: eventId, category_key: file.category, owner_person_id: owner?.id ?? null, owner_group: file.ownerGroup, original_file_name: file.fileName, source_rel_path: file.relPath, thumb_path: thumbPath, preview_path: previewPath, width: metadata.width ?? null, height: metadata.height ?? null, sort_order: index });
        if (error) throw error; imported += 1;
      } catch (error) { failed.push({ file: file.relPath, reason: error instanceof Error ? error.message : "가져오기 실패" }); }
      report(index + 1, pending.length, file.fileName);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, pending.length)) }, () => worker()));
  const result = { ok: failed.length === 0, eventId, photoCount: files.length, importedCount: imported, skippedCount: files.length - pending.length, peopleCount: people.size, createdPeople, skippedFolders, failedCount: failed.length, failed };
  process.stdout.write(`${JSON.stringify(result)}\n`); if (failed.length) process.exitCode = 1;
}

if (process.env.NODE_ENV !== "test") main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "사진 가져오기 실패" })}\n`); process.exitCode = 1; });
