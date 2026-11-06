#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import sharp from "sharp";
import { getSupabaseAdmin } from "@/lib/supabase";
import { classifyPersonFolderName, createUniquePin, normalizeLoginName, normalizeNfc, parseGroupFolderName, parsePersonFolderName, PERSON_FOLDER_JPG_DIRECTORIES } from "@/lib/person-select/core";
import { PERSON_FOLDER_CATEGORY, type PersonSelectCategory } from "@/lib/person-select/types";
import { ensurePersonSelectBucket, PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { readAllPersonSelectRows } from "@/lib/person-select/paging";

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
  const requestedLayout = take("--layout");
  const layout = requestedLayout === "person-folders" || requestedLayout === "project" ? requestedLayout : "school" as const;
  return { eventSlug: take("--event"), eventId: take("--event-id"), root: take("--root"), sourceRelativePath: take("--source-relative-path"), mappings, layout, dryRun: values.includes("--dry-run") };
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

const JPG_FILE = /\.jpe?g$/i;

async function listJpgs(folder: string) {
  try {
    const entries = await readdir(folder, { withFileTypes: true, encoding: "utf8" });
    return entries.filter((entry) => entry.isFile() && !entry.name.startsWith(".") && JPG_FILE.test(entry.name)).map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** 공용 프로젝트는 사람 폴더 규칙을 강제하지 않고 선택한 폴더의 JPG를 재귀 순회한다. */
export async function scanProjectFolder(root: string) {
  const files: Candidate[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true, encoding: "utf8" });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(absolutePath); continue; }
      if (!entry.isFile() || !JPG_FILE.test(entry.name)) continue;
      files.push({ absolutePath, relPath: normalizeNfc(path.relative(root, absolutePath).split(path.sep).join("/")), fileName: normalizeNfc(entry.name), category: PERSON_FOLDER_CATEGORY.key, ownerName: null, ownerGroup: null });
    }
  };
  await visit(root);
  return files.sort((a, b) => a.relPath.localeCompare(b.relPath, "ko"));
}

/**
 * 이름 폴더 구조: 촬영폴더/김춘자/JPG원본/*.jpg (RAW는 김춘자 폴더 안 다른 곳에 그대로 둔다)
 * JPG원본 폴더가 없으면 이름 폴더 바로 아래 JPG를 쓴다.
 * 그룹N 폴더는 작가가 직접 고르므로 올리지 않고, 개인N 폴더는 이름을 아직 안 바꾼 것으로 보고 건너뛴다.
 */
export async function scanPersonFolders(root: string) {
  const files: Candidate[] = [];
  const groupFolders: string[] = [];
  const unnamedFolders: string[] = [];
  const emptyFolders: string[] = [];
  const entries = await readdir(root, { withFileTypes: true, encoding: "utf8" });
  for (const dir of entries) {
    if (!dir.isDirectory()) continue;
    const kind = classifyPersonFolderName(dir.name);
    if (kind.kind === "skip") continue;
    if (kind.kind === "group") { groupFolders.push(normalizeNfc(dir.name)); continue; }
    if (kind.kind === "unnamed") { unnamedFolders.push(normalizeNfc(dir.name)); continue; }
    const personDir = path.join(root, dir.name);
    let jpgDir = personDir;
    let names: string[] = [];
    const children = await readdir(personDir, { withFileTypes: true, encoding: "utf8" });
    for (const candidate of PERSON_FOLDER_JPG_DIRECTORIES) {
      const child = children.find((entry) => entry.isDirectory() && normalizeNfc(entry.name).toLocaleLowerCase("ko-KR") === candidate.toLocaleLowerCase("ko-KR"));
      if (!child) continue;
      const found = await listJpgs(path.join(personDir, child.name));
      if (found.length) { jpgDir = path.join(personDir, child.name); names = found; break; }
    }
    if (!names.length) names = await listJpgs(personDir);
    if (!names.length) { emptyFolders.push(kind.name); continue; }
    for (const name of names) {
      const absolutePath = path.join(jpgDir, name);
      files.push({ absolutePath, relPath: normalizeNfc(path.relative(root, absolutePath).split(path.sep).join("/")), fileName: normalizeNfc(name), category: PERSON_FOLDER_CATEGORY.key, ownerName: kind.name, ownerGroup: null });
    }
  }
  return { files: files.sort((a, b) => a.relPath.localeCompare(b.relPath, "ko")), groupFolders, unnamedFolders, emptyFolders };
}

async function main() {
  const input = readArgs();
  if (input.layout === "school" && !input.mappings.length) throw new Error("가져오기 항목 매핑이 필요합니다.");
  const root = input.root
    ? (await resolvePersonSelectSourcePath(input.root)).canonicalPath
    : (await resolvePersonSelectSourcePath(input.sourceRelativePath ?? "")).canonicalPath;
  const db = getSupabaseAdmin();
  const query = db.from("person_select_events").select("id,slug,categories,access_mode");
  const { data: event, error: eventError } = input.eventId ? await query.eq("id", input.eventId).single() : await query.eq("slug", input.eventSlug ?? "").single();
  if (eventError || !event) throw new Error(eventError?.message || "행사를 찾을 수 없습니다.");
  const eventId = event.id;
  const accessMode = event.access_mode;
  let files: Candidate[];
  let skippedFolders: string[] = [];
  let groupFolders: string[] = [];
  let unnamedFolders: string[] = [];
  let emptyFolders: string[] = [];
  if (input.layout === "project") {
    files = await scanProjectFolder(root);
  } else if (input.layout === "person-folders") {
    const scanned = await scanPersonFolders(root);
    ({ files, groupFolders, unnamedFolders, emptyFolders } = scanned);
  } else {
    files = await scanPersonSelectFolders(root, input.mappings);
    skippedFolders = await findSkippedFolders(root, input.mappings);
  }
  const peopleNames = event.access_mode === "project_shared" ? [] : [...new Set(files.map((file) => file.ownerName).filter((value): value is string => Boolean(value)))];
  if (input.dryRun) {
    process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, root, photoCount: files.length, people: peopleNames, skippedFolders, groupFolders, unnamedFolders, emptyFolders, byCategory: Object.fromEntries([...new Set(files.map((file) => file.category))].map((category) => [category, files.filter((file) => file.category === category).length])) })}\n`);
    return;
  }
  await ensurePersonSelectBucket();
  // 다음 단계(RAW 매칭)가 같은 폴더에서 원본을 찾도록 가져온 폴더와 방식을 행사에 남긴다.
  const eventUpdate: Record<string, unknown> = { source_layout: input.layout, updated_at: new Date().toISOString() };
  if (input.sourceRelativePath) eventUpdate.source_relative_path = input.sourceRelativePath;
  if (input.layout === "person-folders") {
    const categories = (Array.isArray(event.categories) ? event.categories : []) as PersonSelectCategory[];
    if (!categories.some((category) => category.key === PERSON_FOLDER_CATEGORY.key)) {
      const { count } = await db.from("person_select_images").select("id", { count: "exact", head: true }).eq("event_id", eventId);
      // 아직 사진이 하나도 없는 행사라면 학교용 기본 항목 대신 "사진" 항목 하나만 둔다.
      eventUpdate.categories = (count ?? 0) === 0 ? [PERSON_FOLDER_CATEGORY] : [...categories, PERSON_FOLDER_CATEGORY];
    }
  }
  const { error: eventUpdateError } = await db.from("person_select_events").update(eventUpdate).eq("id", eventId);
  if (eventUpdateError) throw eventUpdateError;
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
  const existingRows = await readAllPersonSelectRows((from, to) => db.from("person_select_images")
    .select("id,source_rel_path")
    .eq("event_id", eventId)
    .order("id")
    .range(from, to));
  const existing = new Set(existingRows.map((row) => row.source_rel_path));
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
        const owner = accessMode !== "project_shared" && file.ownerName ? people.get(normalizeLoginName(file.ownerName)) : null;
        const { error } = await db.from("person_select_images").insert({ id: imageId, event_id: eventId, category_key: file.category, owner_person_id: owner?.id ?? null, owner_group: file.ownerGroup, original_file_name: file.fileName, source_rel_path: file.relPath, thumb_path: thumbPath, preview_path: previewPath, width: metadata.width ?? null, height: metadata.height ?? null, sort_order: index });
        if (error) throw error; imported += 1;
      } catch (error) { failed.push({ file: file.relPath, reason: error instanceof Error ? error.message : "가져오기 실패" }); }
      report(index + 1, pending.length, file.fileName);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, pending.length)) }, () => worker()));
  const result = { ok: failed.length === 0, eventId, photoCount: files.length, importedCount: imported, skippedCount: files.length - pending.length, peopleCount: people.size, createdPeople, skippedFolders, groupFolders, unnamedFolders, emptyFolders, failedCount: failed.length, failed };
  process.stdout.write(`${JSON.stringify(result)}\n`); if (failed.length) process.exitCode = 1;
}

if (process.env.NODE_ENV !== "test") main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "사진 가져오기 실패" })}\n`); process.exitCode = 1; });
