#!/usr/bin/env node

import path from "node:path";
import { mkdtemp, copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { ensurePersonSelectDownloadBucket, PERSON_SELECT_DOWNLOAD_BUCKET } from "@/lib/person-select/downloads";
import { resolvePersonSelectSourcePath } from "@/lib/person-select/sourceRoots";
import { getSupabaseAdmin } from "@/lib/supabase";

function arg(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function report(current: number, total: number, message: string) { process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "DOWNLOAD_PACKAGE", current, total, message })}\n`); }
function safeRelative(value: string) {
  const normalized = value.replace(/\\/g, "/");
  if (!normalized || path.isAbsolute(normalized) || normalized.split("/").some((part) => part === ".." || part === "")) throw new Error("안전하지 않은 사진 상대경로입니다.");
  return normalized;
}
async function runDitto(source: string, output: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", source, output], { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (chunk) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(error || `ditto 종료 코드 ${code}`)));
  });
}

async function main() {
  const jobId = arg("--job-id");
  if (!jobId) throw new Error("--job-id가 필요합니다.");
  const db = getSupabaseAdmin();
  const { data: job, error: jobError } = await db.from("person_select_download_jobs").select("*").eq("id", jobId).single();
  if (jobError || !job) throw new Error(jobError?.message ?? "다운로드 작업을 찾을 수 없습니다.");
  const { data: event, error: eventError } = await db.from("person_select_events").select("id,title,source_relative_path").eq("id", job.event_id).single();
  if (eventError || !event?.source_relative_path) throw new Error(eventError?.message ?? "원본 폴더가 연결되지 않았습니다.");
  const { data: images, error: imageError } = await db.from("person_select_images").select("id,source_rel_path,original_file_name").eq("event_id", event.id).in("id", job.image_ids);
  if (imageError || !images || images.length !== job.image_ids.length) throw new Error(imageError?.message ?? "다운로드 사진 소유관계가 일치하지 않습니다.");
  const root = await resolvePersonSelectSourcePath(event.source_relative_path);
  const temporary = await mkdtemp(path.join(tmpdir(), "olivia-person-select-download-"));
  const staging = path.join(temporary, "photos");
  const archive = path.join(temporary, "photos.zip");
  await mkdir(staging);
  await db.from("person_select_download_jobs").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", jobId);
  let completed = 0;
  let failed = 0;
  try {
    for (const image of images) {
      try {
        const relative = safeRelative(image.source_rel_path);
        const candidate = path.resolve(root.canonicalPath, relative);
        if (!candidate.startsWith(`${root.canonicalPath}${path.sep}`)) throw new Error("원본 폴더 밖의 파일입니다.");
        let source = candidate;
        if (job.format === "raw") {
          const stem = candidate.replace(/\.[^.]+$/, "");
          const extensions = [".CR3", ".CR2", ".NEF", ".ARW", ".RAF", ".DNG", ".ORF", ".RW2"];
          source = "";
          for (const extension of extensions) {
            try {
              await stat(`${stem}${extension}`);
              source = `${stem}${extension}`;
              break;
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            }
          }
          if (!source) throw new Error(`RAW를 찾지 못했습니다: ${image.original_file_name}`);
        } else await stat(source);
        await copyFile(source, path.join(staging, `${String(completed + failed + 1).padStart(4, "0")}_${path.basename(source)}`));
        completed += 1;
      } catch (error) {
        failed += 1;
        process.stderr.write(`[person-select-download] ${image.original_file_name}: ${error instanceof Error ? error.message : String(error)}\n`);
      }
      report(completed + failed, images.length, `${completed + failed}/${images.length} 원본 준비`);
      await db.from("person_select_download_jobs").update({ completed_count: completed, failed_count: failed, updated_at: new Date().toISOString() }).eq("id", jobId);
    }
    if (!completed) throw new Error("다운로드할 원본을 찾지 못했습니다.");
    await runDitto(staging, archive);
    await ensurePersonSelectDownloadBucket();
    const storagePath = `${event.id}/${job.id}.zip`;
    const { error: uploadError } = await db.storage.from(PERSON_SELECT_DOWNLOAD_BUCKET).upload(storagePath, await readFile(archive), { contentType: "application/zip", upsert: true });
    if (uploadError) throw uploadError;
    const status = failed ? "partial_failed" : "completed";
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.from("person_select_download_jobs").update({ status, completed_count: completed, failed_count: failed, storage_path: storagePath, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("id", jobId);
    process.stdout.write(`${JSON.stringify({ ok: true, jobId, status, completed, failed })}\n`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

main().catch(async (error) => {
  const jobId = arg("--job-id");
  if (jobId) await getSupabaseAdmin().from("person_select_download_jobs").update({ status: "failed", error: error instanceof Error ? error.message : "다운로드 실패", updated_at: new Date().toISOString() }).eq("id", jobId);
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
