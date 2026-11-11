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
import { mkdir, open, readdir, stat } from "node:fs/promises";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeNfc } from "@/lib/person-select/core";
import {
  normalizePersonSelectRawMatchSource,
  resolveIndividualRawMatchTargets,
  resolveSharedRawMatchTargets,
  type PersonSelectRawImage,
  type PersonSelectRawMatchSource,
} from "@/lib/person-select/rawMatch";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { resolveCaptureTimeCandidate } from "@/lib/selectMatch/captureMatch";
import { parseCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";
import { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/rawMatchCopy";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

export const PERSON_SELECT_RAW_OUTPUT = "Selected_RAW";
const SKIP_DIRECTORIES = new Set([PERSON_SELECT_RAW_OUTPUT.toLowerCase(), "jpg원본", "jpg전체"]);

type RawFile = { path: string; relPath: string; name: string; size: number };
type ChoiceRow = { person_id: string; image_id: string; person_select_images: { id: string; original_file_name: string; source_rel_path: string } | null };
type SharedDraftRow = { reviewer_id: string; items: Array<{ image_id?: string }> | null };
type SharedSelectionRow = { id: string; reviewer_id: string };
type SharedSelectionItemRow = { selection_id: string; image_id: string };
type SharedImageRow = { id: string; original_file_name: string; source_rel_path: string };

function readArgs() {
  const values = process.argv.slice(2);
  const take = (flag: string) => { const i = values.indexOf(flag); return i >= 0 ? values[i + 1] : undefined; };
  const reviewerIdsJson = take("--reviewer-ids-json");
  let reviewerIds: string[] | undefined;
  if (reviewerIdsJson) {
    const parsed = JSON.parse(reviewerIdsJson) as unknown;
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) throw new Error("검토자 범위가 올바르지 않습니다.");
    reviewerIds = [...new Set(parsed)];
  }
  return { eventId: take("--event-id"), source: normalizePersonSelectRawMatchSource(take("--source")), reviewerIds };
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

function imageRow(value: SharedImageRow): PersonSelectRawImage {
  return { id: value.id, originalFileName: value.original_file_name, sourceRelPath: value.source_rel_path };
}

function safeSourceFile(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath.split(/[\\/]+/u).filter(Boolean).join(path.sep));
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") throw new Error("사진 파일 경로가 없습니다.");
    throw new Error("사진 파일이 촬영 폴더 밖을 가리킵니다.");
  }
  return candidate;
}

async function readCaptureTime(filePath: string): Promise<CaptureTime | null> {
  const handle = await open(filePath, "r");
  try {
    const metadata = await handle.stat();
    const length = Math.min(4 * 1024 * 1024, metadata.size);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
    return parseCaptureTime(arrayBuffer);
  } finally {
    await handle.close();
  }
}

async function loadTargets(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  eventId: string;
  accessMode: string;
  source: PersonSelectRawMatchSource;
  reviewerIds?: string[];
}) {
  if (input.accessMode !== "project_shared") {
    const [{ data: people, error: peopleError }, { data: choices, error: choiceError }] = await Promise.all([
      input.db.from("person_select_people").select("id,display_name,submitted_at").eq("event_id", input.eventId),
      input.db.from("person_select_choices").select("person_id,image_id,person_select_images(id,original_file_name,source_rel_path)").eq("event_id", input.eventId),
    ]);
    if (peopleError) throw peopleError;
    if (choiceError) throw choiceError;
    const result = resolveIndividualRawMatchTargets({
      source: input.source,
      people: (people ?? []).map((person) => ({ id: person.id, displayName: person.display_name, submittedAt: person.submitted_at })),
      choices: ((choices ?? []) as unknown as ChoiceRow[]).map((choice) => ({
        personId: choice.person_id,
        image: choice.person_select_images ? imageRow(choice.person_select_images) : null,
      })),
    });
    return {
      ...result,
      reviewerIds: [] as string[],
      submittedPeople: (people ?? []).filter((person) => Boolean(person.submitted_at)).length,
      notSubmitted: (people ?? []).filter((person) => !person.submitted_at).map((person) => String(person.display_name)),
    };
  }

  const [{ data: reviewers, error: reviewersError }, { data: drafts, error: draftsError }, { data: selections, error: selectionsError }] = await Promise.all([
    input.db.from("person_select_shared_reviewers").select("id,display_name,active").eq("event_id", input.eventId),
    input.db.from("person_select_shared_drafts").select("reviewer_id,items").eq("event_id", input.eventId),
    input.db.from("person_select_shared_selections").select("id,reviewer_id").eq("event_id", input.eventId).order("submitted_at", { ascending: false }),
  ]);
  if (reviewersError) throw reviewersError;
  if (draftsError) throw draftsError;
  if (selectionsError) throw selectionsError;
  const latestSelectionByReviewer = new Map<string, SharedSelectionRow>();
  for (const selection of (selections ?? []) as SharedSelectionRow[]) {
    if (!latestSelectionByReviewer.has(selection.reviewer_id)) latestSelectionByReviewer.set(selection.reviewer_id, selection);
  }
  const selectionIds = [...latestSelectionByReviewer.values()].map((selection) => selection.id);
  const { data: selectionItems, error: itemError } = selectionIds.length
    ? await input.db.from("person_select_shared_selection_items").select("selection_id,image_id").in("selection_id", selectionIds)
    : { data: [], error: null };
  if (itemError) throw itemError;
  const allImageIds = new Set<string>();
  for (const draft of (drafts ?? []) as SharedDraftRow[]) {
    for (const item of Array.isArray(draft.items) ? draft.items : []) if (item.image_id) allImageIds.add(item.image_id);
  }
  for (const item of (selectionItems ?? []) as SharedSelectionItemRow[]) allImageIds.add(item.image_id);
  const { data: images, error: imagesError } = allImageIds.size
    ? await input.db.from("person_select_images").select("id,original_file_name,source_rel_path").eq("event_id", input.eventId).in("id", [...allImageIds])
    : { data: [], error: null };
  if (imagesError) throw imagesError;
  const imageById = new Map(((images ?? []) as SharedImageRow[]).map((image) => [image.id, imageRow(image)]));
  const submittedByReviewer = new Map<string, PersonSelectRawImage[]>();
  for (const [reviewerId, selection] of latestSelectionByReviewer) {
    submittedByReviewer.set(reviewerId, ((selectionItems ?? []) as SharedSelectionItemRow[])
      .filter((item) => item.selection_id === selection.id)
      .flatMap((item) => imageById.get(item.image_id) ? [imageById.get(item.image_id)!] : []));
  }
  const draftByReviewer = new Map<string, PersonSelectRawImage[]>();
  for (const draft of (drafts ?? []) as SharedDraftRow[]) {
    draftByReviewer.set(draft.reviewer_id, (Array.isArray(draft.items) ? draft.items : [])
      .flatMap((item) => item.image_id && imageById.get(item.image_id) ? [imageById.get(item.image_id)!] : []));
  }
  const result = resolveSharedRawMatchTargets({
    source: input.source,
    reviewers: (reviewers ?? []).map((reviewer) => ({ id: reviewer.id, displayName: reviewer.display_name, active: reviewer.active !== false })),
    reviewerIds: input.reviewerIds,
    submittedByReviewer,
    draftByReviewer,
  });
  if (result.invalidReviewerIds.length) throw new Error("선택한 검토자가 이 프로젝트에 없거나 접속 중지 상태입니다.");
  return {
    ...result,
    targets: result.targets.map((target) => ({ ...target, ownerName: "프로젝트" })),
    submittedPeople: result.reviewerIds.filter((reviewerId) => submittedByReviewer.has(reviewerId)).length,
    notSubmitted: [] as string[],
  };
}

function safeFolderName(value: string) {
  return normalizeNfc(value).replace(/[\\/:*?"<>|\0]/g, "_").trim() || "이름없음";
}

async function main() {
  const { eventId, source, reviewerIds } = readArgs();
  if (!eventId) throw new Error("--event-id가 필요합니다.");
  const db = getSupabaseAdmin();
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title,source_relative_path,access_mode").eq("id", eventId).single();
  if (eventError || !event) throw new Error(eventError?.message || "행사를 찾을 수 없습니다.");
  if (!event.source_relative_path) throw new Error("사진을 가져온 폴더 기록이 없습니다. 사진 올리기를 한 번 다시 해주세요.");
  const root = (await resolvePersonSelectSourcePath(event.source_relative_path)).canonicalPath;

  const targetResult = await loadTargets({ db, eventId, accessMode: event.access_mode, source, reviewerIds });
  const targets = targetResult.targets;
  if (!targets.length) throw new Error(source === "current" ? "RAW 매칭할 현재 선택 사진이 없습니다." : "RAW 매칭할 최종 선택 사진이 없습니다.");

  report("SCANNING", 0, targets.length, "촬영 폴더에서 RAW를 찾는 중입니다.");
  const rawIndex = await indexRawFiles(root);

  const outputRoot = path.join(root, PERSON_SELECT_RAW_OUTPUT);
  const matched: { name: string; jpg: string; raw: string; attributeVerified: boolean }[] = [];
  const alreadyCopied: { name: string; raw: string }[] = [];
  const missing: { name: string; jpg: string }[] = [];
  const ambiguous: { name: string; jpg: string; candidates: string[] }[] = [];
  const timeMismatch: { name: string; jpg: string; candidates: string[] }[] = [];
  const missingTime: { name: string; jpg: string; candidates: string[] }[] = [];
  const conflicts: { name: string; raw: string }[] = [];
  let done = 0;
  const captureCache = new Map<string, Promise<CaptureTime | null>>();
  const captureFor = (filePath: string) => {
    let current = captureCache.get(filePath);
    if (!current) { current = readCaptureTime(filePath).catch(() => null); captureCache.set(filePath, current); }
    return current;
  };
  const reviewRequired: Array<{ owner: string; jpg: string; reason: string; candidates?: string[] }> = [];
  for (const choice of targets) {
    const name = choice.ownerName;
    const rawCandidates = rawIndex.get(rawBasename(choice.originalFileName)) ?? [];
    const jpgPath = safeSourceFile(root, choice.sourceRelPath);
    const jpgCaptureTime = await captureFor(jpgPath).catch(() => null);
    const candidateTimes = await Promise.all(rawCandidates.map((candidate) => captureFor(candidate.path)));
    const resolved = resolveCaptureTimeCandidate({
      jpgCaptureTime,
      jpgRelativePath: choice.sourceRelPath,
      candidates: rawCandidates.map((candidate, index) => ({
        id: candidate.relPath,
        captureTime: candidateTimes[index],
        fileSize: candidate.size,
        relativePath: candidate.relPath,
      })),
    });
    const picked = resolved.confirmedCandidateId
      ? rawCandidates.find((candidate) => candidate.relPath === resolved.confirmedCandidateId) ?? null
      : null;
    if (!picked) {
      const reason = resolved.status;
      if (reason === "raw_missing") missing.push({ name, jpg: choice.originalFileName });
      else if (reason === "multiple_candidates") ambiguous.push({ name, jpg: choice.originalFileName, candidates: rawCandidates.map((file) => file.relPath) });
      else if (reason === "time_mismatch") timeMismatch.push({ name, jpg: choice.originalFileName, candidates: rawCandidates.map((file) => file.relPath) });
      else if (reason === "missing_time") missingTime.push({ name, jpg: choice.originalFileName, candidates: rawCandidates.map((file) => file.relPath) });
      reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason, candidates: rawCandidates.map((file) => file.relPath) });
    } else {
      const targetDir = path.join(outputRoot, safeFolderName(name));
      const target = path.join(targetDir, picked.name);
      await mkdir(targetDir, { recursive: true });
      const existing = await stat(target).catch(() => null);
      if (existing) {
        if (existing.size === picked.size) alreadyCopied.push({ name, raw: picked.name });
        else {
          conflicts.push({ name, raw: picked.name });
          reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason: "conflict", candidates: [picked.relPath] });
        }
      } else {
        await copyOrMovePreservingMetadata({ source: picked.path, destinationDirectory: targetDir, move: false });
        matched.push({ name, jpg: choice.originalFileName, raw: picked.relPath, attributeVerified: true });
      }
    }
    done += 1;
    report("COPYING", done, targets.length, `${name} · ${choice.originalFileName}`);
  }

  const result = {
    ok: reviewRequired.length === 0,
    eventId,
    source,
    reviewerIds: targetResult.reviewerIds,
    outputRelativePath: PERSON_SELECT_RAW_OUTPUT,
    submittedPeople: targetResult.submittedPeople,
    notSubmitted: targetResult.notSubmitted,
    submittedSelectedCount: targetResult.submittedSelectedCount,
    currentUnsubmittedCount: targetResult.currentUnsubmittedCount,
    selectedCount: targets.length,
    matchedCount: matched.length,
    alreadyCopiedCount: alreadyCopied.length,
    missing,
    ambiguous,
    timeMismatch,
    missingTime,
    conflicts,
    reviewRequired,
  };
  await db.from("person_select_events").update({ raw_match_result: result, raw_matched_at: new Date().toISOString() }).eq("id", eventId);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.env.NODE_ENV !== "test") main().catch((error) => { process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "RAW 매칭 실패" })}\n`); process.exitCode = 1; });
