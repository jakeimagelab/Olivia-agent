import type { NextRequest } from "next/server";

import { readPublicColorMatchManifest } from "@/lib/photo-edit/server/colorMatchResults";
import { isAdminSession } from "@/lib/passkey";
import { getConfiguredWorkerId } from "@/lib/remoteWorkerAuth";
import { normalizeRemoteJobRequestPayload } from "@/lib/remote-jobs/requestPayload";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type RemoteJobRow = {
  id: string;
  action: string;
  status: string;
  payload: Record<string, unknown> | null;
  progress: unknown;
  result: Record<string, unknown> | null;
  error: string | null;
  message: string | null;
  created_at: string;
  completed_at: string | null;
};

const JOB_SELECT = "id,action,status,payload,progress,result,error,message,created_at,completed_at";

function manifestStoragePath(job: RemoteJobRow | null): string | null {
  const value = job?.result?.manifestStoragePath;
  return typeof value === "string" && value.startsWith("photo-retouch/") ? value : null;
}

async function recentJobs(): Promise<RemoteJobRow[]> {
  const { data, error } = await getSupabaseAdmin().from("remote_jobs")
    .select(JOB_SELECT)
    .eq("action", "PHOTO_COLOR_MATCH")
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as RemoteJobRow[];
}

async function latestJob(): Promise<RemoteJobRow | null> {
  const { data, error } = await getSupabaseAdmin().from("remote_jobs")
    .select(JOB_SELECT)
    .in("action", ["PHOTO_COLOR_MATCH", "PHOTO_COLOR_RENDER"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RemoteJobRow | null;
}

async function manifestJobForOutput(outputPath: string): Promise<RemoteJobRow | null> {
  const { data, error } = await getSupabaseAdmin().from("remote_jobs")
    .select(JOB_SELECT)
    .in("action", ["PHOTO_COLOR_MATCH", "PHOTO_COLOR_RENDER"])
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as RemoteJobRow[]).find((job) => (
    job.result?.outputVirtualPath === outputPath
    || job.payload?.output_path === outputPath
  ) && manifestStoragePath(job)) ?? null;
}

export async function GET(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    if (request.nextUrl.searchParams.get("recent") === "1") {
      const jobs = await recentJobs();
      return Response.json({
        ok: true,
        recent: jobs.map((job) => ({
          id: job.id,
          sourcePath: typeof job.payload?.source_path === "string" ? job.payload.source_path : "",
          outputPath: typeof job.result?.outputVirtualPath === "string" ? job.result.outputVirtualPath : "",
          summary: job.result?.summary ?? null,
          createdAt: job.created_at,
          completedAt: job.completed_at,
        })),
      });
    }
    const outputPath = request.nextUrl.searchParams.get("output_path")?.trim() || "";
    const job = outputPath ? await manifestJobForOutput(outputPath) : await latestJob();
    const storagePath = manifestStoragePath(job);
    const colorMatch = storagePath ? await readPublicColorMatchManifest(storagePath) : null;
    return Response.json({ ok: true, job, colorMatch });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤 결과를 읽지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const payload = normalizeRemoteJobRequestPayload("PHOTO_COLOR_MATCH", {
      source_path: body.sourcePath ?? body.source_path,
      output_path: body.outputPath ?? body.output_path,
      options: body.options ?? { brightness: body.brightness, skin_tone: body.skinTone ?? body.skin_tone },
      reference: body.reference ?? { mode: body.targetMode ?? body.target_mode, file: body.referenceFile ?? body.reference_file },
      selected_file_names: body.selectedFileNames ?? body.selected_file_names,
    });
    const db = getSupabaseAdmin();
    const { data: active } = await db.from("remote_jobs").select(JOB_SELECT)
      .eq("action", "PHOTO_COLOR_MATCH")
      .eq("payload->>source_path", payload.source_path)
      .in("status", ["QUEUED", "RUNNING"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return Response.json({ ok: true, job: active, reused: true });
    const { data, error } = await db.from("remote_jobs").insert({
      action: "PHOTO_COLOR_MATCH",
      payload,
      target_worker: getConfiguredWorkerId(),
      status: "QUEUED",
    }).select(JOB_SELECT).single();
    if (error) throw error;
    return Response.json({ ok: true, job: data, reused: false });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤을 시작하지 못했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const payload = normalizeRemoteJobRequestPayload("PHOTO_COLOR_RENDER", {
      output_path: body.outputPath ?? body.output_path,
      changes: body.changes,
      common_recipe: body.commonRecipe ?? body.common_recipe,
      target_measurement: body.targetMeasurement ?? body.target_measurement,
    });
    const db = getSupabaseAdmin();
    const { data: active } = await db.from("remote_jobs").select(JOB_SELECT)
      .eq("action", "PHOTO_COLOR_RENDER")
      .eq("payload->>output_path", payload.output_path)
      .in("status", ["QUEUED", "RUNNING"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (active) return Response.json({ ok: false, error: "색 맞춤 저장이 이미 진행 중입니다.", job: active }, { status: 409 });
    const { data, error } = await db.from("remote_jobs").insert({
      action: "PHOTO_COLOR_RENDER",
      payload,
      target_worker: getConfiguredWorkerId(),
      status: "QUEUED",
    }).select(JOB_SELECT).single();
    if (error) throw error;
    return Response.json({ ok: true, job: data });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤 저장을 시작하지 못했습니다." }, { status: 400 });
  }
}
