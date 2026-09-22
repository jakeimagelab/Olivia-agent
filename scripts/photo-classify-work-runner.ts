#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { parseClassificationOptions, runPhotoClassifyWork } from "@/lib/photo-classifier/node/photoClassifyWork";
import { analyzePhotoSceneRemotely } from "@/lib/photo-classifier/node/remoteSceneAi";

loadEnvConfig(process.cwd());

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

function parseArguments(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${argument}`);
    const equals = argument.indexOf("=");
    if (equals > 2) {
      values[argument.slice(2, equals)] = argument.slice(equals + 1);
      continue;
    }
    const key = argument.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      index += 1;
    } else {
      values[key] = "true";
    }
  }
  return values;
}

function booleanValue(values: Record<string, string>, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (value === undefined) return fallback;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`--${key} 값은 true 또는 false여야 합니다.`);
}

async function main(): Promise<void> {
  const values = parseArguments(process.argv.slice(2));
  const workRelativePath = values["work-relative-path"] ?? values.work;
  if (!workRelativePath) throw new Error("--work-relative-path가 필요합니다.");
  const payload = {
    department: values.department,
    shooting_mode: values["shooting-mode"],
    gap_minutes: values["gap-minutes"] === undefined ? undefined : Number(values["gap-minutes"]),
    classification_ui_mode: values["classification-ui-mode"],
    fast_analyze_mode: booleanValue(values, "fast-analyze-mode", false),
    department_logic_enabled: booleanValue(values, "department-logic-enabled", true),
    ai_naming_enabled: booleanValue(values, "ai-naming-enabled", false),
    quality_analysis_enabled: booleanValue(values, "quality-analysis-enabled", false),
    profile_classification_enabled: booleanValue(values, "profile-classification-enabled", true),
  };
  const options = parseClassificationOptions(payload);
  const result = await runPhotoClassifyWork({
    workRelativePath,
    expectedJpgCount: values["expected-jpg-count"] === undefined ? undefined : Number(values["expected-jpg-count"]),
    expectedJpgBytes: values["expected-jpg-bytes"] === undefined ? undefined : Number(values["expected-jpg-bytes"]),
    ...options,
  }, {
    ...(options.aiNamingEnabled ? { ai: { scene: analyzePhotoSceneRemotely } } : {}),
    onProgress: (progress) => process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify(progress)}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "CLASSIFY_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
