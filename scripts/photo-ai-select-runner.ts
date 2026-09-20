#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { runPhotoAiSelect } from "@/lib/photo-operations/node/photoAiSelect";

loadEnvConfig(process.cwd());
const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

function args(): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index];
    if (!key.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${key}`);
    const name = key.slice(2);
    const value = process.argv[index + 1];
    values[name] = value && !value.startsWith("--") ? (index += 1, value) : "true";
  }
  return values;
}

function optionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (["true", "1", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no"].includes(value.toLowerCase())) return false;
  throw new Error("boolean 옵션은 true 또는 false여야 합니다.");
}

async function main() {
  const values = args();
  const projectRelativePath = values["project-relative-path"];
  if (!projectRelativePath) throw new Error("--project-relative-path가 필요합니다.");
  const result = await runPhotoAiSelect({
    projectRelativePath,
    inputRelativePath: values["input-relative-path"],
    options: {
      qualityFilter: optionalBoolean(values["quality-filter"]),
      blurThreshold: values["blur-threshold"] ? Number(values["blur-threshold"]) : undefined,
      darkThreshold: values["dark-threshold"] ? Number(values["dark-threshold"]) : undefined,
      overexpThreshold: values["overexp-threshold"] ? Number(values["overexp-threshold"]) : undefined,
      dupRemoval: optionalBoolean(values["dup-removal"]),
      dupThreshold: values["dup-threshold"] ? Number(values["dup-threshold"]) : undefined,
    },
    onProgress: (progress) => process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify(progress)}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "AI_SELECT_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
