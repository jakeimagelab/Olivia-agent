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
import { mkdir, open, readdir, stat, writeFile } from "node:fs/promises";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeNfc } from "@/lib/person-select/core";
import {
  normalizePersonSelectRawMatchSource,
  normalizePersonSelectRawMatchMode,
  normalizePersonSelectRawLabelNames,
  PERSON_SELECT_RAW_OUTPUT_FOLDER,
  resolvePersonSelectRawMatchPathPlan,
} from "@/lib/person-select/rawMatch";
import { loadPersonSelectRawMatchTargets } from "@/lib/person-select/node/rawMatchTargets";
import {
  clearPersonSelectRawMarks,
  markPersonSelectRawSidecar,
} from "@/lib/person-select/node/rawMarkFileOperations";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { resolveCaptureTimeCandidate } from "@/lib/selectMatch/captureMatch";
import { parseCaptureTime, type CaptureTime } from "@/lib/selectMatch/captureTime";
import { copyOrMovePreservingMetadata } from "@/lib/selectMatch/node/rawMatchCopy";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";
import { isDeliveredRoundFolder } from "@/lib/photo-bridge/rawMatchDelivery";

export const PERSON_SELECT_RAW_OUTPUT = PERSON_SELECT_RAW_OUTPUT_FOLDER;
const SKIP_DIRECTORIES = new Set([PERSON_SELECT_RAW_OUTPUT.toLowerCase(), "jpg", "jpg원본", "jpg전체"]);

type RawFile = { path: string; relPath: string; name: string; size: number };

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
  const rawSource = take("--source");
  const rawMode = take("--mode");
  if (rawSource !== undefined && rawSource !== "submitted" && rawSource !== "current") {
    throw new Error("워커 코드가 오래되었습니다. 최신화 후 다시 실행하세요.");
  }
  if (rawMode !== undefined && rawMode !== "copy" && rawMode !== "mark") {
    throw new Error("워커 코드가 오래되었습니다. 최신화 후 다시 실행하세요.");
  }
  let labelNames: unknown;
  const labelNamesJson = take("--label-names-json");
  if (labelNamesJson) labelNames = JSON.parse(labelNamesJson);
  return {
    eventId: take("--event-id"),
    source: normalizePersonSelectRawMatchSource(rawSource),
    mode: normalizePersonSelectRawMatchMode(rawMode),
    clearMark: values.includes("--clear-mark"),
    labelNames: normalizePersonSelectRawLabelNames(labelNames),
    reviewerIds,
  };
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
        if (SKIP_DIRECTORIES.has(normalizeNfc(entry.name).toLowerCase()) || isDeliveredRoundFolder(entry.name)) continue;
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

function safeFolderName(value: string) {
  return normalizeNfc(value).replace(/[\\/:*?"<>|\0]/g, "_").trim() || "이름없음";
}

const WORKER_CODE_VERSION = process.env.OLIVIA_WORKER_CODE_VERSION?.trim() || "2026.11.13-person-select-raw-copy-v2";
let failureStage = "STARTING";

function matchingDuplicateRaws(
  picked: RawFile,
  rawCandidates: RawFile[],
  candidateTimes: Array<CaptureTime | null>,
) {
  const pickedIndex = rawCandidates.findIndex((candidate) => candidate.relPath === picked.relPath);
  const pickedTime = candidateTimes[pickedIndex];
  if (!pickedTime) return [picked];
  return rawCandidates.filter((candidate, index) => (
    candidate.size === picked.size
    && candidateTimes[index]?.timestampMs === pickedTime.timestampMs
  ));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function main() {
  const { eventId, source, mode, clearMark, labelNames, reviewerIds } = readArgs();
  if (!eventId) throw new Error("--event-id가 필요합니다.");
  const db = getSupabaseAdmin();
  failureStage = "LOADING_PROJECT";
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title,source_relative_path,access_mode,customer_view_mode,raw_match_result").eq("id", eventId).single();
  if (eventError || !event) throw new Error(eventError?.message || "행사를 찾을 수 없습니다.");
  if (!event.source_relative_path) throw new Error("사진을 가져온 폴더 기록이 없습니다. 사진 올리기를 한 번 다시 해주세요.");
  const pathPlan = resolvePersonSelectRawMatchPathPlan(
    event.source_relative_path,
    event.access_mode === "project_shared" ? "프로젝트" : "<이름>",
  );
  const [jpgLocation, shootingLocation] = await Promise.all([
    resolvePersonSelectSourcePath(pathPlan.sourcePath),
    resolvePersonSelectSourcePath(pathPlan.shootingPath),
  ]);
  if (jpgLocation.root.id !== shootingLocation.root.id) {
    throw new Error("JPG 폴더와 RAW 검색 폴더의 저장소가 다릅니다. 같은 저장소 안의 촬영 폴더를 연결해 주세요.");
  }
  const relativeJpgFolder = path.relative(shootingLocation.canonicalPath, jpgLocation.canonicalPath);
  if (relativeJpgFolder.startsWith("..") || path.isAbsolute(relativeJpgFolder)) {
    throw new Error("JPG 폴더가 RAW 검색 촬영 폴더 안에 있지 않습니다. 사진 원본 경로를 다시 연결해 주세요.");
  }
  const jpgRoot = jpgLocation.canonicalPath;
  const shootingRoot = shootingLocation.canonicalPath;

  if (clearMark) {
    if (mode !== "mark") throw new Error("로우 셀렉 지우기는 mark 모드에서만 실행할 수 있습니다.");
    failureStage = "RESTORING_XMP";
    const cleared = await clearPersonSelectRawMarks({
      shootingRoot,
      previousResult: event.raw_match_result && typeof event.raw_match_result === "object"
        ? event.raw_match_result as Record<string, unknown>
        : null,
    });
    const result = {
      ok: cleared.failed.length === 0,
      mode: "mark",
      cleared: true,
      eventId,
      restoredCount: cleared.restored,
      deletedCount: cleared.deleted,
      failed: cleared.failed,
      workerCodeVersion: WORKER_CODE_VERSION,
      completedAt: new Date().toISOString(),
    };
    await db.from("person_select_events").update({ raw_match_result: result, raw_matched_at: new Date().toISOString() }).eq("id", eventId);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  failureStage = "LOADING_SELECTIONS";
  const targetResult = await loadPersonSelectRawMatchTargets({
    db,
    eventId,
    accessMode: event.access_mode,
    binarySelection: event.customer_view_mode !== "bridge",
    source,
    reviewerIds,
  });
  const targets = targetResult.targets;
  if (!targets.length) throw new Error(source === "current" ? "RAW 매칭할 현재 선택 사진이 없습니다." : "RAW 매칭할 최종 선택 사진이 없습니다.");

  failureStage = "SCANNING_RAW";
  report("SCANNING", 0, targets.length, "촬영 폴더에서 RAW를 찾는 중입니다.");
  const rawIndex = await indexRawFiles(shootingRoot);

  const outputRoot = path.join(shootingRoot, PERSON_SELECT_RAW_OUTPUT);
  const matched: { name: string; jpg: string; raw: string; attributeVerified: boolean }[] = [];
  const alreadyCopied: { name: string; raw: string }[] = [];
  const missing: { name: string; jpg: string }[] = [];
  const ambiguous: { name: string; jpg: string; candidates: string[] }[] = [];
  const timeMismatch: { name: string; jpg: string; candidates: string[] }[] = [];
  const missingTime: { name: string; jpg: string; candidates: string[] }[] = [];
  const conflicts: { name: string; raw: string }[] = [];
  const markedSidecars: Array<{ rawPath: string; sidecarPath: string; created: boolean }> = [];
  const markFailures: Array<{ raw: string; error: string }> = [];
  const copyFailures: Array<{ stage: "raw_copy"; name: string; jpg: string; raw: string; error: string }> = [];
  const rawMarkJobId = `${eventId}-${Date.now().toString(36)}`;
  let ratingCount = 0;
  let colorCount = 0;
  let conflictCount = 0;
  let done = 0;
  const captureCache = new Map<string, Promise<CaptureTime | null>>();
  const captureFor = (filePath: string) => {
    let current = captureCache.get(filePath);
    if (!current) { current = readCaptureTime(filePath).catch(() => null); captureCache.set(filePath, current); }
    return current;
  };
  const reviewRequired: Array<{ owner: string; jpg: string; reason: string; candidates?: string[]; stage?: string; error?: string }> = [];
  for (const choice of targets) {
    const name = choice.ownerName;
    const rawCandidates = rawIndex.get(rawBasename(choice.originalFileName)) ?? [];
    const jpgPath = safeSourceFile(jpgRoot, choice.sourceRelPath);
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
      if (mode === "mark") {
        failureStage = "WRITING_XMP";
        const duplicateRaws = matchingDuplicateRaws(picked, rawCandidates, candidateTimes);
        if (choice.customerRating !== null) ratingCount += 1;
        if (choice.customerColorLabel !== null) colorCount += 1;
        if (choice.markConflict) conflictCount += 1;
        for (const raw of duplicateRaws) {
          try {
            markedSidecars.push(await markPersonSelectRawSidecar({
              raw,
              shootingRoot,
              jobId: rawMarkJobId,
              rating: choice.customerRating,
              colorLabel: choice.customerColorLabel,
              labelNames,
            }));
          } catch (error) {
            markFailures.push({ raw: raw.relPath, error: error instanceof Error ? error.message : "XMP 기록 실패" });
          }
        }
      } else {
        failureStage = "COPYING_RAW";
        const targetDir = path.join(outputRoot, safeFolderName(name));
        try {
          await mkdir(targetDir, { recursive: true });
          const operation = await copyOrMovePreservingMetadata({ source: picked.path, destinationDirectory: targetDir, move: false });
          if (operation.alreadyExisted) alreadyCopied.push({ name, raw: picked.name });
          else matched.push({ name, jpg: choice.originalFileName, raw: picked.relPath, attributeVerified: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : "RAW 복사 실패";
          if (message.includes("같은 이름이 있어 덮어쓰지 않음")) {
            conflicts.push({ name, raw: picked.name });
            reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason: "conflict", candidates: [picked.relPath] });
          } else {
            copyFailures.push({ stage: "raw_copy", name, jpg: choice.originalFileName, raw: picked.relPath, error: message });
            reviewRequired.push({ owner: name, jpg: choice.originalFileName, reason: "copy_failed", candidates: [picked.relPath], stage: "raw_copy", error: message });
          }
        }
      }
    }
    done += 1;
    report(mode === "mark" ? "MARKING" : "COPYING", done, targets.length, `${name} · ${choice.originalFileName}`);
  }

  const result = {
    ok: true,
    completedWithReview: reviewRequired.length > 0 || markFailures.length > 0,
    eventId,
    mode,
    source,
    reviewerIds: targetResult.reviewerIds,
    sourceRelativePath: pathPlan.sourcePath,
    rawSearchRelativePath: pathPlan.shootingPath,
    outputRelativePath: event.access_mode === "project_shared"
      ? `${PERSON_SELECT_RAW_OUTPUT}/프로젝트`
      : `${PERSON_SELECT_RAW_OUTPUT}/<이름>`,
    storageRootId: jpgLocation.root.id,
    storageRootLabel: jpgLocation.root.label,
    submittedPeople: targetResult.submittedPeople,
    notSubmitted: targetResult.notSubmitted,
    submittedSelectedCount: targetResult.submittedSelectedCount,
    currentUnsubmittedCount: targetResult.currentUnsubmittedCount,
    selectedCount: targets.length,
    matchedCount: matched.length,
    alreadyCopiedCount: alreadyCopied.length,
    markedCount: new Set(markedSidecars.map((item) => item.rawPath)).size,
    ratingCount,
    colorCount,
    conflictCount,
    rawMarkJobId: mode === "mark" ? rawMarkJobId : null,
    labelNames,
    markedSidecars,
    markFailures,
    copyFailures,
    missing,
    ambiguous,
    timeMismatch,
    missingTime,
    conflicts,
    reviewRequired,
    workerCodeVersion: WORKER_CODE_VERSION,
    completedAt: new Date().toISOString(),
  };
  if (mode === "copy") {
    failureStage = "WRITING_MATCH_LOG";
    await mkdir(outputRoot, { recursive: true });
    const header = ["JPG 이름", "RAW 경로", "결과", "속성 확인"];
    const rows = [
      ...matched.map((item) => [item.jpg, item.raw, "확정", item.attributeVerified ? "통과" : "실패"]),
      ...alreadyCopied.map((item) => ["", item.raw, "이미 있음", "통과"]),
      ...reviewRequired.map((item) => [item.jpg, (item.candidates ?? []).join(" | "), "건너뜀", item.reason]),
    ];
    await writeFile(path.join(outputRoot, "_match_log.csv"), `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
  }
  failureStage = "SAVING_RESULT";
  await db.from("person_select_events").update({ raw_match_result: result, raw_matched_at: new Date().toISOString() }).eq("id", eventId);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.env.NODE_ENV !== "test") main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : "RAW 매칭 실패",
    stage: failureStage,
    workerCodeVersion: WORKER_CODE_VERSION,
  })}\n`);
  process.exitCode = 1;
});
