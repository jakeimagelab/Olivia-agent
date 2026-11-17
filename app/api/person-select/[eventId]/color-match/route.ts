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
  progress: unknown;
  result: Record<string, unknown> | null;
  error: string | null;
  message: string | null;
  created_at: string;
  completed_at: string | null;
};

async function project(eventId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("person_select_events").select("id,title").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data;
}

async function latestJob(eventId: string): Promise<RemoteJobRow | null> {
  const { data, error } = await getSupabaseAdmin().from("remote_jobs")
    .select("id,action,status,progress,result,error,message,created_at,completed_at")
    .in("action", ["PERSON_SELECT_COLOR_MATCH", "PERSON_SELECT_COLOR_RENDER"])
    .eq("payload->>event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as RemoteJobRow | null;
}

async function latestManifestJob(eventId: string): Promise<RemoteJobRow | null> {
  const { data, error } = await getSupabaseAdmin().from("remote_jobs")
    .select("id,action,status,progress,result,error,message,created_at,completed_at")
    .in("action", ["PERSON_SELECT_COLOR_MATCH", "PERSON_SELECT_COLOR_RENDER"])
    .eq("payload->>event_id", eventId)
    .eq("status", "COMPLETED")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return ((data ?? []) as RemoteJobRow[]).find((job) => typeof job.result?.manifestStoragePath === "string") ?? null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    const event = await project(eventId);
    if (!event) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const [job, manifestJob] = await Promise.all([latestJob(eventId), latestManifestJob(eventId)]);
    const manifestStoragePath = typeof manifestJob?.result?.manifestStoragePath === "string" ? manifestJob.result.manifestStoragePath : null;
    const colorMatch = manifestStoragePath ? await readPublicColorMatchManifest(manifestStoragePath) : null;
    return Response.json({ ok: true, event, job, colorMatch });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤 결과를 읽지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    if (!await project(eventId)) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const payload = normalizeRemoteJobRequestPayload("PERSON_SELECT_COLOR_MATCH", {
      event_id: eventId,
      source_relative_path: body.sourcePath ?? body.source_relative_path,
      brightness: body.brightness,
      skin_tone: body.skinTone ?? body.skin_tone,
      target_mode: body.targetMode ?? body.target_mode,
      reference_file: body.referenceFile ?? body.reference_file,
    });
    const db = getSupabaseAdmin();
    const { data: active } = await db.from("remote_jobs").select("id,status,progress,result,error")
      .eq("action", "PERSON_SELECT_COLOR_MATCH").eq("payload->>event_id", eventId)
      .in("status", ["QUEUED", "RUNNING"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (active) return Response.json({ ok: true, job: active, reused: true });
    const { data, error } = await db.from("remote_jobs").insert({
      action: "PERSON_SELECT_COLOR_MATCH",
      payload,
      target_worker: getConfiguredWorkerId(),
      status: "QUEUED",
    }).select("id,status,progress,result,error").single();
    if (error) throw error;
    return Response.json({ ok: true, job: data, reused: false });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤을 시작하지 못했습니다." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  if (!isAdminSession(request)) return Response.json({ ok: false, error: "관리자 로그인이 필요합니다." }, { status: 401 });
  const { eventId } = await context.params;
  try {
    if (!await project(eventId)) return Response.json({ ok: false, error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const payload = normalizeRemoteJobRequestPayload("PERSON_SELECT_COLOR_RENDER", {
      event_id: eventId,
      output_relative_path: body.outputRelativePath ?? body.output_relative_path,
      changes: body.changes,
      common_recipe: body.commonRecipe ?? body.common_recipe,
      target_measurement: body.targetMeasurement ?? body.target_measurement,
    });
    const db = getSupabaseAdmin();
    const { data: active } = await db.from("remote_jobs").select("id,status")
      .eq("action", "PERSON_SELECT_COLOR_RENDER").eq("payload->>event_id", eventId)
      .in("status", ["QUEUED", "RUNNING"]).limit(1).maybeSingle();
    if (active) return Response.json({ ok: false, error: "색 맞춤 저장이 이미 진행 중입니다.", job: active }, { status: 409 });
    const { data, error } = await db.from("remote_jobs").insert({
      action: "PERSON_SELECT_COLOR_RENDER",
      payload,
      target_worker: getConfiguredWorkerId(),
      status: "QUEUED",
    }).select("id,status,progress,result,error").single();
    if (error) throw error;
    return Response.json({ ok: true, job: data });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "색 맞춤 저장을 시작하지 못했습니다." }, { status: 400 });
  }
}
