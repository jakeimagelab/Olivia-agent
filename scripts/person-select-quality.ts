#!/usr/bin/env node

import { analyzePhotoQualityLocally, preparePhotoQualityPreview } from "@/lib/photo-quality/image";
import { analyzePhotoQualityWithOpenAI } from "@/lib/photo-quality/openai";
import { decidePhotoQuality } from "@/lib/photo-quality/decision";
import { PHOTO_QUALITY_ANALYSIS_VERSION } from "@/lib/photo-quality/types";
import { PERSON_SELECT_BUCKET } from "@/lib/person-select/server";
import { getSupabaseAdmin } from "@/lib/supabase";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function progress(current: number, total: number, message: string) {
  process.stderr.write(`OLIVIA_REMOTE_PROGRESS ${JSON.stringify({ stage: "AI_QUALITY", current, total, message })}\n`);
}

async function waitUntilRunnable(jobId: string) {
  const db = getSupabaseAdmin();
  for (;;) {
    const { data, error } = await db.from("photo_quality_analysis_jobs").select("status").eq("id", jobId).single();
    if (error || !data) throw new Error(error?.message ?? "AI 품질 작업 상태를 확인하지 못했습니다.");
    if (data.status === "canceled") return false;
    if (data.status !== "paused") return true;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function claimRunningJob(jobId: string) {
  const db = getSupabaseAdmin();
  for (;;) {
    const { data, error } = await db.from("photo_quality_analysis_jobs").select("status,started_at").eq("id", jobId).single();
    if (error || !data) throw new Error(error?.message ?? "AI 품질 작업 상태를 확인하지 못했습니다.");
    if (data.status === "canceled") return false;
    if (data.status === "paused") { await new Promise((resolve) => setTimeout(resolve, 1_000)); continue; }
    if (data.status === "running") return true;
    if (data.status !== "queued") throw new Error(`실행할 수 없는 AI 품질 작업 상태입니다: ${data.status}`);
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from("photo_quality_analysis_jobs")
      .update({ status: "running", started_at: data.started_at ?? now, updated_at: now, error: null })
      .eq("id", jobId)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (claimed) return true;
  }
}

async function main() {
  const jobId = arg("--job-id");
  if (!jobId) throw new Error("--job-id가 필요합니다.");
  const db = getSupabaseAdmin();
  const { data: job, error: jobError } = await db.from("photo_quality_analysis_jobs").select("*").eq("id", jobId).single();
  if (jobError || !job) throw new Error(jobError?.message ?? "AI 품질 작업을 찾을 수 없습니다.");
  const { data: items, error: itemsError } = await db.from("photo_quality_analysis_job_items")
    .select("image_id,status,attempts,person_select_images!inner(id,event_id,preview_path,thumb_path)")
    .eq("job_id", jobId)
    .in("status", ["queued", "failed"])
    .order("image_id");
  if (itemsError) throw itemsError;
  const total = items?.length ?? 0;
  if (!await claimRunningJob(jobId)) {
    process.stdout.write(`${JSON.stringify({ ok: true, jobId, status: "canceled", completed: Number(job.completed_count ?? 0), failed: Number(job.failed_count ?? 0) })}\n`);
    return;
  }
  let completed = Number(job.completed_count ?? 0);
  let failed = Number(job.failed_count ?? 0);
  let processed = 0;
  let nextIndex = 0;
  let canceled = false;
  let progressWrite = Promise.resolve();
  const updateProgress = () => {
    const snapshot = { completed, failed, processed };
    progressWrite = progressWrite.then(async () => {
      await db.from("photo_quality_analysis_jobs").update({ completed_count: snapshot.completed, failed_count: snapshot.failed, updated_at: new Date().toISOString() }).eq("id", jobId);
      progress(snapshot.processed, total, `${snapshot.processed}/${total}장 분석`);
    });
  };
  const processItem = async (item: NonNullable<typeof items>[number]) => {
    const image = item.person_select_images as unknown as { id: string; event_id: string; preview_path: string; thumb_path: string };
    const itemStarted = new Date().toISOString();
    await db.from("photo_quality_analysis_job_items").update({ status: "running", attempts: Number(item.attempts ?? 0) + 1, started_at: itemStarted, error: null }).eq("job_id", jobId).eq("image_id", image.id);
    try {
      const storagePath = image.preview_path || image.thumb_path;
      const { data: blob, error: downloadError } = await db.storage.from(PERSON_SELECT_BUCKET).download(storagePath);
      if (downloadError || !blob) throw new Error(downloadError?.message ?? "미리보기를 읽지 못했습니다.");
      const source = Buffer.from(await blob.arrayBuffer());
      const [{ fingerprint, dataUrl }, local] = await Promise.all([preparePhotoQualityPreview(source), analyzePhotoQualityLocally(source)]);
      const { data: cached } = await db.from("photo_quality_analysis_results").select("id").eq("image_id", image.id).eq("content_fingerprint", fingerprint).eq("analysis_version", job.analysis_version).maybeSingle();
      let resultId = cached?.id as string | undefined;
      if (!resultId) {
        const modeled = await analyzePhotoQualityWithOpenAI({ imageDataUrl: dataUrl, model: job.model });
        const decision = decidePhotoQuality(modeled.assessment, local);
        const { data: saved, error: saveError } = await db.from("photo_quality_analysis_results").upsert({
          event_id: job.event_id,
          image_id: image.id,
          content_fingerprint: fingerprint,
          analysis_version: job.analysis_version ?? PHOTO_QUALITY_ANALYSIS_VERSION,
          model: modeled.model,
          analysis_status: decision.status,
          flags: decision.flags,
          confidence: decision.confidence,
          local_metrics: local,
          explanation: decision.explanation,
          analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "image_id,content_fingerprint,analysis_version" }).select("id").single();
        if (saveError || !saved) throw new Error(saveError?.message ?? "분석 결과를 저장하지 못했습니다.");
        resultId = saved.id;
      }
      completed += 1;
      await db.from("photo_quality_analysis_job_items").update({ status: cached ? "skipped" : "completed", result_id: resultId, finished_at: new Date().toISOString() }).eq("job_id", jobId).eq("image_id", image.id);
    } catch (error) {
      failed += 1;
      await db.from("photo_quality_analysis_job_items").update({ status: "failed", error: error instanceof Error ? error.message : "분석 실패", finished_at: new Date().toISOString() }).eq("job_id", jobId).eq("image_id", image.id);
    }
    processed += 1;
    updateProgress();
  };
  const concurrency = Math.max(1, Math.min(5, Number(process.env.PHOTO_QUALITY_CONCURRENCY ?? 3) || 3));
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (!canceled) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) return;
      if (!await waitUntilRunnable(jobId)) { canceled = true; return; }
      await processItem(items![index]);
    }
  }));
  await progressWrite;
  if (canceled) {
    process.stdout.write(`${JSON.stringify({ ok: true, jobId, status: "canceled", completed, failed })}\n`);
    return;
  }
  const status = failed === 0 ? "completed" : completed > 0 ? "partial_failed" : "failed";
  await db.from("photo_quality_analysis_jobs").update({ status, completed_count: completed, failed_count: failed, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  process.stdout.write(`${JSON.stringify({ ok: status !== "failed", jobId, status, completed, failed })}\n`);
}

main().catch(async (error) => {
  const jobId = arg("--job-id");
  if (jobId) await getSupabaseAdmin().from("photo_quality_analysis_jobs").update({ status: "failed", error: error instanceof Error ? error.message : "분석 실패", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
