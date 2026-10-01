#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import {
  runRemoteJpgClassificationPipeline,
} from "@/lib/photo-classifier/node/remoteJpgClassificationPipeline";
import type { RemotePhotoSortRunnerOptions } from "@/lib/photo-classifier/node/types";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";

loadEnvConfig(process.cwd());

const DEPARTMENTS = new Set<MedicalDepartment>([
  "dermatology",
  "dentistry",
  "ophthalmology",
  "orthopedics_neurosurgery",
  "pediatrics",
  "korean_medicine",
  "plastic_surgery",
  "obgyn",
  "internal_medicine_checkup",
  "general",
]);

type CliValues = Record<string, string>;

// Remote Bridge가 이 prefix 뒤 JSON을 그대로 /api/worker/report의 progress로 전달한다.
// 최종 machine result는 기존대로 stdout 한 줄 JSON만 사용한다.
export const REMOTE_PHOTO_PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

function parseArguments(args: string[]): CliValues {
  const values: CliValues = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${argument}`);
    const equalsIndex = argument.indexOf("=");
    if (equalsIndex > 2) {
      values[argument.slice(2, equalsIndex)] = argument.slice(equalsIndex + 1);
      continue;
    }
    const key = argument.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      values[key] = "true";
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function booleanValue(values: CliValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (value === undefined) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`--${key} 값은 true 또는 false여야 합니다.`);
}

function inputFromArguments(values: CliValues): RemotePhotoSortRunnerOptions & { sourceFolder: string } {
  const sourceFolder = values["source-folder"];
  if (!sourceFolder) throw new Error("--source-folder가 필요합니다.");

  const departmentValue = values.department ?? "dermatology";
  if (!DEPARTMENTS.has(departmentValue as MedicalDepartment)) {
    throw new Error(`지원하지 않는 진료과입니다: ${departmentValue}`);
  }
  const classificationUiMode = values["classification-ui-mode"] ?? "ai-auto";
  if (classificationUiMode !== "ai-auto" && classificationUiMode !== "advanced") {
    throw new Error("--classification-ui-mode은 ai-auto 또는 advanced여야 합니다.");
  }
  const gapMinutes = Number(values["gap-minutes"] ?? "3.5");
  const options = {
    department: departmentValue as MedicalDepartment,
    gapMinutes,
    classificationUiMode,
    fastAnalyzeMode: booleanValue(values, "fast-analyze-mode", false),
    departmentLogicEnabled: booleanValue(values, "department-logic-enabled", true),
    aiNamingEnabled: booleanValue(values, "ai-naming-enabled", false),
    qualityAnalysisEnabled: booleanValue(values, "quality-analysis-enabled", false),
    profileClassificationEnabled: booleanValue(values, "profile-classification-enabled", true),
  } as const;

  return { ...options, sourceFolder };
}

async function main(): Promise<void> {
  const values = parseArguments(process.argv.slice(2));
  const result = await runRemoteJpgClassificationPipeline(inputFromArguments(values), {
    onProgress: (progress) => {
      process.stderr.write(`${REMOTE_PHOTO_PROGRESS_PREFIX}${JSON.stringify(progress)}\n`);
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
  const failure = {
    ok: false,
    status: "CLASSIFY_FAILED",
    error: error instanceof Error ? error.message : String(error),
  };
  process.stdout.write(`${JSON.stringify(failure)}\n`);
  process.exitCode = 1;
});
