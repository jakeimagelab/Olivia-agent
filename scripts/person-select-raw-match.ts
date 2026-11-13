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
import { mkdir, writeFile } from "node:fs/promises";
import { getSupabaseAdmin } from "@/lib/supabase";
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
} from "@/lib/person-select/node/rawMarkFileOperations";
import {
  indexPersonSelectRawFiles,
} from "@/lib/person-select/node/rawFileIndex";
import { executePersonSelectRawMatch } from "@/lib/person-select/node/rawMatchExecution";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";

export const PERSON_SELECT_RAW_OUTPUT = PERSON_SELECT_RAW_OUTPUT_FOLDER;

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

const WORKER_CODE_VERSION = process.env.OLIVIA_WORKER_CODE_VERSION?.trim() || "2026.11.13-person-select-raw-copy-v2";
let failureStage = "STARTING";

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
  const rawIndex = await indexPersonSelectRawFiles(shootingRoot);

  const outputRoot = path.join(shootingRoot, PERSON_SELECT_RAW_OUTPUT);
  const rawMarkJobId = `${eventId}-${Date.now().toString(36)}`;
  const execution = await executePersonSelectRawMatch({
    targets,
    rawIndex,
    jpgRoot,
    shootingRoot,
    outputRoot,
    mode,
    labelNames,
    rawMarkJobId,
    onStageChange: (stage) => { failureStage = stage; },
    onProgress: ({ stage, current, total, message }) => report(stage, current, total, message),
  });
  const {
    matched,
    alreadyCopied,
    missing,
    ambiguous,
    timeMismatch,
    missingTime,
    conflicts,
    markedSidecars,
    markFailures,
    copyFailures,
    reviewRequired,
    ratingCount,
    colorCount,
    conflictCount,
  } = execution;

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
