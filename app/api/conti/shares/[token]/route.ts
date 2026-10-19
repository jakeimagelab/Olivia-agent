import { NextRequest, NextResponse } from "next/server";
import { normalizeContiStudioState } from "@/lib/conti/studioState";
import type { ContiDoctor } from "@/components/conti/v2/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ token: string }> };
const ALLOWED_KEYS = new Set(["checklistCompleted", "checklistAssignees", "doctors", "timelineOrder", "hospitalRequestNote", "submitted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const output: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") return null;
    output[key] = entry.slice(0, 120);
  }
  return output;
}

function booleanRecord(value: unknown): Record<string, boolean> | null {
  if (!isRecord(value)) return null;
  const output: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "boolean") return null;
    output[key] = entry;
  }
  return output;
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const shareResult = await db.from("conti_run_shares").select("id,run_id,audience,can_edit,revoked_at").eq("token", token).maybeSingle();
  const share = shareResult.data;
  if (shareResult.error || !share || share.revoked_at) return NextResponse.json({ ok: false, error: "유효하지 않은 공유 링크입니다." }, { status: 404 });
  if (share.audience !== "hospital" || !share.can_edit) return NextResponse.json({ ok: false, error: "이 링크에는 작성 권한이 없습니다." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ ok: false, error: "저장할 값이 올바르지 않습니다." }, { status: 400 });
  const unknownKeys = Object.keys(body).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length) return NextResponse.json({ ok: false, error: `병원 링크에서 수정할 수 없는 항목입니다: ${unknownKeys.join(", ")}` }, { status: 400 });
  if ("submitted" in body && typeof body.submitted !== "boolean") return NextResponse.json({ ok: false, error: "작성 완료 값이 올바르지 않습니다." }, { status: 400 });

  const runResult = await db.from("conti_runs").select("id,doctors,doctor_count,studio_state,hospital_id").eq("id", share.run_id).maybeSingle();
  if (runResult.error || !runResult.data) return NextResponse.json({ ok: false, error: "콘티를 찾지 못했습니다." }, { status: 404 });
  const currentDoctors = Array.isArray(runResult.data.doctors) ? runResult.data.doctors as ContiDoctor[] : [];
  const nextState = normalizeContiStudioState(runResult.data.studio_state);
  const runPatch: Record<string, unknown> = {};

  if ("checklistCompleted" in body) {
    const value = booleanRecord(body.checklistCompleted);
    if (!value) return NextResponse.json({ ok: false, error: "준비사항 체크 값이 올바르지 않습니다." }, { status: 400 });
    nextState.checklistCompleted = value;
  }
  if ("checklistAssignees" in body) {
    const value = textRecord(body.checklistAssignees);
    if (!value) return NextResponse.json({ ok: false, error: "준비사항 담당자 값이 올바르지 않습니다." }, { status: 400 });
    nextState.checklistAssignees = value;
  }
  if ("timelineOrder" in body) {
    if (!Array.isArray(body.timelineOrder) || body.timelineOrder.some((entry) => typeof entry !== "string")) return NextResponse.json({ ok: false, error: "촬영 순서 값이 올바르지 않습니다." }, { status: 400 });
    nextState.timelineOrder = body.timelineOrder;
  }
  if ("hospitalRequestNote" in body) {
    if (typeof body.hospitalRequestNote !== "string") return NextResponse.json({ ok: false, error: "요청 메모가 올바르지 않습니다." }, { status: 400 });
    nextState.hospitalRequestNote = body.hospitalRequestNote.slice(0, 4000);
  }
  if ("doctors" in body) {
    if (!Array.isArray(body.doctors)) return NextResponse.json({ ok: false, error: "의료진 명단이 올바르지 않습니다." }, { status: 400 });
    const editableById = new Map<string, { name: string; day: string | null }>();
    for (const raw of body.doctors) {
      if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string" || !(raw.day == null || typeof raw.day === "string") || Object.keys(raw).some((key) => !["id", "name", "day"].includes(key))) {
        return NextResponse.json({ ok: false, error: "병원에서는 의료진 이름과 촬영일만 수정할 수 있습니다." }, { status: 400 });
      }
      editableById.set(raw.id, { name: raw.name.slice(0, 120), day: raw.day ? raw.day.slice(0, 40) : null });
    }
    const doctors = currentDoctors.map((doctor) => editableById.has(doctor.id) ? { ...doctor, ...editableById.get(doctor.id) } : doctor);
    runPatch.doctors = doctors;
    runPatch.doctor_count = doctors.length;
  }

  runPatch.studio_state = nextState;
  const savedAt = new Date().toISOString();
  const saveResult = await db.from("conti_runs").update(runPatch).eq("id", share.run_id);
  if (saveResult.error) return NextResponse.json({ ok: false, error: saveResult.error.message }, { status: 500 });
  const submitted = body.submitted === true;
  const sharePatch = { edited_at: savedAt, ...(submitted ? { submitted_at: savedAt } : {}) };
  const shareUpdate = await db.from("conti_run_shares").update(sharePatch).eq("id", share.id);
  if (shareUpdate.error) return NextResponse.json({ ok: false, error: shareUpdate.error.message }, { status: 500 });

  if (submitted) {
    await db.from("olivia_notification_history").insert({
      notification_key: `conti-hospital-submitted:${share.id}:${savedAt.slice(0, 16)}`,
      notification_type: "conti.hospital_submitted",
      client_id: runResult.data.hospital_id ?? null,
      channel: "dashboard",
      title: "병원에서 촬영 콘티 작성을 완료했습니다.",
      message: "준비사항과 의료진 배정 내용을 확인해 주세요.",
      delivery_status: "queued",
      scheduled_at: savedAt,
    });
  }

  return NextResponse.json({ ok: true, editedAt: savedAt, submittedAt: submitted ? savedAt : undefined });
}
