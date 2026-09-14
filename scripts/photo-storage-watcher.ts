#!/usr/bin/env node

import { PhotoStorageWatcher, type PhotoWatcherReadyReport } from "@/lib/photo-classifier/node/photoWatcher";
import { resolveServerBaseUrl } from "@/lib/baseUrl";

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positiveNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name}은(는) 0보다 큰 숫자여야 합니다.`);
  return parsed;
}

const args = process.argv.slice(2);
const once = args.includes("--once");

async function main(): Promise<void> {
  const reportUrl = process.env.OLIVIA_PHOTO_STORAGE_REPORT_URL?.trim()
    || `${resolveServerBaseUrl()}/api/photo-storage/projects/report`;
  const watcher = new PhotoStorageWatcher({
    intervalSeconds: positiveNumber(optionValue(args, "--interval-seconds"), "--interval-seconds"),
    stableSeconds: positiveNumber(optionValue(args, "--stable-seconds"), "--stable-seconds"),
    statePath: optionValue(args, "--state-path"),
    lockPath: optionValue(args, "--lock-path"),
    reportReady: async (report: PhotoWatcherReadyReport) => {
      const internalKey = process.env.INTERNAL_API_KEY?.trim();
      if (!internalKey) throw new Error("INTERNAL_API_KEY가 설정되어 있지 않아 서버 동기화를 건너뛸 수 없습니다.");
      const response = await fetch(reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-key": internalKey },
        body: JSON.stringify({
          project_name: report.projectName,
          source_relative_path: report.sourceRelativePath,
          status: report.status,
          raw_count: report.rawCount,
          jpg_count: report.jpgCount,
          jpg_bytes: report.jpgBytes,
          fingerprint: report.fingerprint,
          prepared_at: report.preparedAt,
          message: report.message,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`서버 프로젝트 등록 실패 (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
      }
    },
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await watcher.stop();
    if (!once) process.exit(0);
  };

  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });

  try {
    const result = await watcher.start({ once });
    if (once) process.stdout.write(`${JSON.stringify(result)}\n`);
    else await new Promise<void>(() => undefined);
  } catch (error) {
    await watcher.stop().catch(() => undefined);
    console.error(`[PHOTO_WATCHER] ERROR ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

void main();
