#!/usr/bin/env node

/**
 * 개인별 사진 셀렉 → RAW 매칭 (Mac Studio에서 실행)
 *
 * 최종 제출한 사람들이 고른 JPG와 파일 이름이 같은 RAW를 찾아
 * 사진을 가져온 폴더 안 Selected_RAW/<이름>/ 으로 복사한다.
 * - RAW는 먼저 그 사람 폴더 안에서 찾고, 없으면 촬영 폴더 전체에서 찾는다.
 * - 후보가 둘 이상이면 고르지 않고 확인 필요로 남긴다.
 * - 원본 RAW는 옮기거나 지우지 않는다. 이미 같은 파일이 복사돼 있으면 건너뛴다.
 */

import path from "node:path";
import { constants } from "node:fs";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeNfc } from "@/lib/person-select/core";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

export const PERSON_SELECT_RAW_OUTPUT = "Selected_RAW";
const SKIP_DIRECTORIES = new Set([PERSON_SELECT_RAW_OUTPUT.toLowerCase(), "jpg원본", "jpg전체"]);

type RawFile = { path: string; relPath: string; name: string; size: number };
type ChoiceRow = { person_id: string; category_key: string; person_select_images: { original_file_name: string; source_rel_path: string } | null };
type SharedChoiceRow = { person_select_images: { original_file_name: string; source_rel_path: string } | null };

function readArgs() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const i = values.indexOf(flag); return i >= 0 ? values[i + 1] : undefined; };
  return { eventId: take("--event-id") };
}

function report(stage: string, current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage, current, total, message })}\n`);
}

function extension(name: string) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function rawBasename(fileName: string) {
  return normalizeNfc(fileName).replace(/\.[^.]+$/, "").toLocaleLowerCase("en-US");
}

/** 촬영 폴더 안의 RAW를 파일 이름(확장자 제외)별로 모은다. */
export async function indexRawFiles(root: string) {
  const index = new Map<string, RawFile[]>();
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true, encoding: "utf8" })) {
      if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(normalizeNfc(entry.name).toLowerCase())) continue;
        await visit(fullPath);
        continue;
      }
      if (!entry.isFile() || !SELECT_MATCH_RAW_EXTENSIONS.has(extension(entry.name))) continue;
      const info = await stat(fullPath);
      const file: RawFile = { path: fullPath, relPath: normalizeNfc(path.relative(root, fullPath).split(path.sep).join("/")), name: normalizeNfc(entry.name), size: info.size };
      const key = rawBasename(entry.name);
      index.set(key, [...(index.get(key) ?? []), file]);
    }
  };
  await visit(root);
  return index;
}

/** 고른 JPG 하나에 맞는 RAW 하나를 정한다. 사람 폴더 안을 먼저 보고, 없으면 전체에서 찾는다. */
export function pickRawCandidate(candidates: RawFile[], personFolder: string) {
  const prefix = `${normalizeNfc(personFolder)}/`;
  const inPerson = candidates.filter((file) => file.relPath.startsWith(prefix));
  const pool = inPerson.length ? inPerson : candidates;
  if (pool.length === 1) return { status: "matched" as const, file: pool[0] };
  if (pool.length > 1) return { status: "ambiguous" as const, files: pool };
  return { status: "missing" as const };
}

/** source_rel_path에서 사진 주인의 폴더를 구한다. JPG원본 같은 하위 폴더는 떼어 낸다. */
export function personFolderOf(sourceRelPath: string) {
  const segments = normalizeNfc(sourceRelPath).split("/").filter(Boolean);
  segments.pop();
  const last = segments.at(-1)?.toLowerCase();
  if (last && SKIP_DIRECTORIES.has(last)) segments.pop();
  if (last === "jpg") segments.pop();
  return segments.join("/");
}

function safeFolderName(value: string) {
  return normalizeNfc(value).replace(/[\\/:*?"<>|\0]/g, "_").trim() || "이름없음";
}

async function main() {
  const { eventId } = readArgs();
  if (!eventId) throw new Error("--event-id가 필요합니다.");
  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title,source_relative_path,access_mode").eq("id", eventId).single();
  if (eventError || !event) throw new Error(eventError?.message || "행사를 찾을 수 없습니다.");
  if (!event.source_relative_path) throw new Error("사진을 가져온 폴더 기록이 없습니다. 사진 올리기를 한 번 다시 해주세요.");
  const root = (await resolvePersonSelectSourcePath(event.source_relative_path)).canonicalPath;

  const targets: { name: string; image: { original_file_name: string; source_rel_path: string } }[] = [];
  let submittedPeople = 0;
  let notSubmitted: string[] = [];
  if (event.access_mode === "project_shared") {
    const { data: selection } = await db.from("person_select_shared_selections").select("id").eq("event_id", eventId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
    if (!selection) throw new Error("최종 제출된 프로젝트 셀렉이 없습니다.");
    const { data: choices, error } = await db.from("person_select_shared_selection_items").select("person_select_images(original_file_name,source_rel_path)").eq("selection_id", selection.id);
    if (error) throw error;
    for (const choice of (choices ?? []) as unknown as SharedChoiceRow[]) if (choice.person_select_images) targets.push({ name: "프로젝트", image: choice.person_select_images });
    submittedPeople = 1;
  } else {
    const [{ data: people, error: peopleError }, { data: choices, error: choiceError }] = await Promise.all([
      db.from("person_select_people").select("id,display_name,submitted_at").eq("event_id", eventId),
      db.from("person_select_choices").select("person_id,category_key,person_select_images(original_file_name,source_rel_path)").eq("event_id", eventId),
    ]);
    if (peopleError) throw peopleError;
    if (choiceError) throw choiceError;
    const submitted = new Map((people ?? []).filter((person) => person.submitted_at).map((person) => [person.id, person.display_name as string]));
    notSubmitted = (people ?? []).filter((person) => !person.submitted_at).map((person) => person.display_name as string);
    for (const choice of (choices ?? []) as unknown as ChoiceRow[]) if (submitted.has(choice.person_id) && choice.person_select_images) targets.push({ name: submitted.get(choice.person_id)!, image: choice.person_select_images });
    submittedPeople = submitted.size;
  }
  if (!targets.length) throw new Error("RAW 매칭할 최종 선택 사진이 없습니다.");

  report("SCANNING", 0, targets.length, "촬영 폴더에서 RAW를 찾는 중입니다.");
  const rawIndex = await indexRawFiles(root);

  const outputRoot = path.join(root, PERSON_SELECT_RAW_OUTPUT);
  const matched: { name: string; jpg: string; raw: string }[] = [];
  const alreadyCopied: { name: string; raw: string }[] = [];
  const missing: { name: string; jpg: string }[] = [];
  const ambiguous: { name: string; jpg: string; candidates: string[] }[] = [];
  const conflicts: { name: string; raw: string }[] = [];
  let done = 0;
  for (const choice of targets) {
    const image = choice.image;
    const name = choice.name;
    const picked = pickRawCandidate(rawIndex.get(rawBasename(image.original_file_name)) ?? [], personFolderOf(image.source_rel_path));
    if (picked.status === "missing") missing.push({ name, jpg: image.original_file_name });
    else if (picked.status === "ambiguous") ambiguous.push({ name, jpg: image.original_file_name, candidates: picked.files.map((file) => file.relPath) });
    else {
      const targetDir = path.join(outputRoot, safeFolderName(name));
      const target = path.join(targetDir, picked.file.name);
      await mkdir(targetDir, { recursive: true });
      const existing = await stat(target).catch(() => null);
      if (existing) {
        if (existing.size === picked.file.size) alreadyCopied.push({ name, raw: picked.file.name });
        else conflicts.push({ name, raw: picked.file.name });
      } else {
        await copyFile(picked.file.path, target, constants.COPYFILE_EXCL);
        matched.push({ name, jpg: image.original_file_name, raw: picked.file.relPath });
      }
    }
    done += 1;
    report("COPYING", done, targets.length, `${name} · ${image.original_file_name}`);
  }

  const result = {
    ok: missing.length === 0 && ambiguous.length === 0 && conflicts.length === 0,
    eventId,
    outputRelativePath: PERSON_SELECT_RAW_OUTPUT,
    submittedPeople,
    notSubmitted,
    selectedCount: targets.length,
    matchedCount: matched.length,
    alreadyCopiedCount: alreadyCopied.length,
    missing,
    ambiguous,
    conflicts,
  };
  await db.from("person_select_events").update({ raw_match_result: result, raw_matched_at: new Date().toISOString() }).eq("id", eventId);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.env.NODE_ENV !== "test") main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "RAW 매칭 실패" })}\n`); process.exitCode = 1; });
