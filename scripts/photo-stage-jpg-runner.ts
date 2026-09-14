#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { stageProjectJpgToWorkStorage } from "@/lib/photo-classifier/node/photoJpgStager";

loadEnvConfig(process.cwd());

const PROGRESS_PREFIX = "OLIVIA_REMOTE_PROGRESS ";

function parseArguments(args: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`알 수 없는 인자입니다: ${argument}`);
    const equals = argument.indexOf("=");
    if (equals > 2) values[argument.slice(2, equals)] = argument.slice(equals + 1);
    else {
      const key = argument.slice(2);
      const value = args[index + 1];
      values[key] = value && !value.startsWith("--") ? (index += 1, value) : "true";
    }
  }
  return values;
}

async function main(): Promise<void> {
  const values = parseArguments(process.argv.slice(2));
  const sourceRelativePath = values["source-relative-path"] ?? values.source;
  if (!sourceRelativePath) throw new Error("--source-relative-path가 필요합니다.");
  const result = await stageProjectJpgToWorkStorage({
    sourceRelativePath,
    destinationRelativePath: values["destination-relative-path"],
    onProgress: (progress) => process.stderr.write(`${PROGRESS_PREFIX}${JSON.stringify(progress)}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "COPY_FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});

