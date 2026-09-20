#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { runPhotoResizeNode } from "@/lib/photo-operations/node/photoResize";

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

async function main() {
  const values = args();
  const projectRelativePath = values["project-relative-path"];
  if (!projectRelativePath) throw new Error("--project-relative-path가 필요합니다.");
  const result = await runPhotoResizeNode({
    projectRelativePath,
    inputRelativePath: values["input-relative-path"],
    longEdge: values["long-edge"] ? Number(values["long-edge"]) : undefined,
    quality: values.quality ? Number(values.quality) : undefined,
    onProgress: (progress) => process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify(progress)}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "RESIZE_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
