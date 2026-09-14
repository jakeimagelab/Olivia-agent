#!/usr/bin/env node

import { loadEnvConfig } from "@next/env";
import { preparePrimaryPhotoProject } from "@/lib/photo-classifier/node/sourceProjectPrep";

loadEnvConfig(process.cwd());

function parseProject(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--project") return args[index + 1] ?? "";
    if (argument.startsWith("--project=")) return argument.slice("--project=".length);
  }
  throw new Error("--project <SSD1 프로젝트 상대경로>가 필요합니다.");
}

async function main(): Promise<void> {
  const project = parseProject(process.argv.slice(2));
  const result = await preparePrimaryPhotoProject(project);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    project: result.projectPath,
    jpgMoved: result.jpgMoved,
    jpgAlreadyPrepared: result.jpgAlreadyPrepared,
    rawCount: result.rawUntouched,
    conflicts: result.conflicts.length,
    status: result.status,
  })}\n`);
  if (result.conflicts.length > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  process.stdout.write(`${JSON.stringify({ ok: false, status: "FAILED", error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
});
