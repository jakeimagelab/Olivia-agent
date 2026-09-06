import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { moveRecordToTrash } from "@/lib/trash";
import { createEventDeduplicationKey, emitOliviaEventSafely } from "@/lib/olivia/events";
import { saveMeetingCommitments } from "@/lib/olivia/commitments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const ASSET_BUCKET = "consultation-assets";
const TEMPLATE_TYPES = new Set(["text", "cornell", "todo", "blank", "grid", "conti"]);
const MEMO_FIELDS_BASE = "id, hospital_id, title, template_type, template_data, raw_memo, summary, extracted_data, recommended_package, next_action, canvas_path, ai_image_path, audio_path, audio_duration_seconds, transcript, audio_summary, created_at, updated_at";
const MEMO_FIELDS = `id, hospital_id, context_type, context_id, title, template_type, template_data, raw_memo, summary, extracted_data, recommended_package, next_action, canvas_path, ai_image_path, audio_path, audio_duration_seconds, transcript, audio_summary, created_at, updated_at`;
// 2026-09-07 마이그레이션(20260907_memo_context_link.sql)이 아직 Supabase에 반영 안 됐으면
// context_type/context_id 컬럼이 없어 위 SELECT/INSERT가 통째로 실패해 메모 목록이 전부
// 사라진 것처럼 보인다 — 그 특정 에러(42703 undefined_column)만 감지해 구컬럼셋으로 재시도한다.
const UNDEFINED_COLUMN = "42703";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" }, hospital_name: { type: "string" }, manager_name: { type: "string" },
    phone: { type: "string" }, email: { type: "string" }, department: { type: "string" },
    purpose: { type: "string" }, shooting_items: { type: "array", items: { type: "string" } },
    doctors_count: { type: "string" }, staff_count: { type: "string" }, locations: { type: "string" },
    needs_video: { type: "boolean" }, needs_website: { type: "boolean" }, interested_in_sns: { type: "boolean" },
    preferred_date: { type: "string" }, budget: { type: "string" }, special_notes: { type: "string" },
    recommended_package: { type: "string" }, next_action: { type: "string" },
    customerNeeds: { type: "array", items: { type: "string" } },
    confirmedItems: { type: "array", items: { type: "string" } },
    unresolvedItems: { type: "array", items: { type: "string" } },
    representativeCommitments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, dueAt: { type: "string" }, ownerName: { type: "string" } },
        required: ["text", "dueAt", "ownerName"],
      },
    },
    clientCommitments: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, dueAt: { type: "string" }, ownerName: { type: "string" } },
        required: ["text", "dueAt", "ownerName"],
      },
    },
    objections: { type: "array", items: { type: "string" } },
    desiredSchedule: { type: "string" },
    decisionMaker: { type: "string" },
    nextAction: { type: "string" },
  },
  required: ["summary", "hospital_name", "manager_name", "phone", "email", "department", "purpose", "shooting_items", "doctors_count", "staff_count", "locations", "needs_video", "needs_website", "interested_in_sns", "preferred_date", "budget", "special_notes", "recommended_package", "next_action", "customerNeeds", "confirmedItems", "unresolvedItems", "representativeCommitments", "clientCommitments", "objections", "desiredSchedule", "decisionMaker", "nextAction"],
};

function outputText(json: any): string {
  if (typeof json.output_text === "string") return json.output_text;
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) if (typeof part.text === "string") return part.text;
  }
  return "";
}

async function withSignedUrls(rows: any[]) {
  const db = getSupabaseAdmin();
  return Promise.all(rows.map(async row => {
    const signed: Record<string, string | null> = {};
    for (const [field, output] of [["canvas_path", "canvas_url"], ["ai_image_path", "ai_image_url"], ["audio_path", "audio_url"]] as const) {
      const path = row[field];
      if (!path) { signed[output] = null; continue; }
      const { data } = await db.storage.from(ASSET_BUCKET).createSignedUrl(path, 60 * 60);
      signed[output] = data?.signedUrl ?? null;
    }
    return { ...row, ...signed };
  }));
}

export async function GET(req: NextRequest) {
  try {
    const db = getSupabaseAdmin();
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      let { data, error } = await db.from("consultation_memos").select(MEMO_FIELDS).eq("id", id).maybeSingle();
      if (error?.code === UNDEFINED_COLUMN) {
        ({ data, error } = await db.from("consultation_memos").select(MEMO_FIELDS_BASE).eq("id", id).maybeSingle());
      }
      if (error) throw error;
      if (!data) return NextResponse.json({ ok: false, error: "메모를 찾을 수 없습니다." }, { status: 404 });
      const [memo] = await withSignedUrls([data]);
      return NextResponse.json({ ok: true, memo });
    }
    // contextType+contextId가 있으면 그 컨텍스트(고객/프로젝트/일정/업무)에 속한 메모만 반환한다 —
    // 없으면(기존 /memo 단독 페이지) 지금까지와 동일하게 최근 100개 전역 목록.
    const contextType = req.nextUrl.searchParams.get("context_type");
    const contextId = req.nextUrl.searchParams.get("context_id");
    const hasContextFilter = Boolean(contextType && contextId);
    let { data, error } = await (() => {
      const query = db.from("consultation_memos").select(MEMO_FIELDS).order("updated_at", { ascending: false });
      return hasContextFilter ? query.eq("context_type", contextType!).eq("context_id", contextId!) : query.limit(100);
    })();
    if (error?.code === UNDEFINED_COLUMN) {
      // 마이그레이션 미적용 — 컨텍스트 필터는 걸 수 없으니(그 컬럼 자체가 없음) 전역 목록으로
      // 최대한 안전하게 폴백한다(빈 화면보다 낫다).
      ({ data, error } = await db.from("consultation_memos").select(MEMO_FIELDS_BASE).order("updated_at", { ascending: false }).limit(100));
    }
    if (error) throw error;
    return NextResponse.json({ ok: true, memos: await withSignedUrls(data ?? []) });
  } catch (error) {
    return NextResponse.json({ ok: false, memos: [], error: error instanceof Error ? error.message : "메모 조회 실패" }, { status: 500 });
  }
}

async function saveMemo(body: any) {
  const db = getSupabaseAdmin();
  const templateType = TEMPLATE_TYPES.has(body.template_type) ? body.template_type : "text";
  const values = {
    hospital_id: body.hospital_id || null,
    context_type: body.context_type || null,
    context_id: body.context_id || null,
    title: String(body.title || "").slice(0, 200),
    template_type: templateType,
    template_data: body.template_data && typeof body.template_data === "object" ? body.template_data : {},
    raw_memo: String(body.raw_memo || "").slice(0, 100_000),
    transcript: String(body.transcript || "").slice(0, 200_000),
    audio_summary: String(body.audio_summary || "").slice(0, 20_000),
  };
  // 마이그레이션(20260907_memo_context_link.sql) 미적용 대비 — 컬럼 자체가 없으면
  // context_type/context_id를 뺀 값으로, select도 구컬럼셋으로 재시도한다.
  const { context_type: _ct, context_id: _ci, ...valuesWithoutContext } = values;
  if (body.id) {
    let { data, error }: { data: any; error: any } = await db.from("consultation_memos").update(values).eq("id", body.id).select(MEMO_FIELDS).single();
    if (error?.code === UNDEFINED_COLUMN) {
      ({ data, error } = await db.from("consultation_memos").update(valuesWithoutContext).eq("id", body.id).select(MEMO_FIELDS_BASE).single());
    }
    if (error) throw error;
    await emitOliviaEventSafely(db, {
      eventType: "consultation.updated",
      eventSource: "memo_api",
      clientId: data.hospital_id ?? null,
      actorType: "admin",
      payload: { memoId: data.id, templateType: data.template_type },
      deduplicationKey: createEventDeduplicationKey("consultation.updated", data.id, data.updated_at),
    });
    return data;
  }
  let { data, error }: { data: any; error: any } = await db.from("consultation_memos").insert(values).select(MEMO_FIELDS).single();
  if (error?.code === UNDEFINED_COLUMN) {
    ({ data, error } = await db.from("consultation_memos").insert(valuesWithoutContext).select(MEMO_FIELDS_BASE).single());
  }
  if (error) throw error;
  await emitOliviaEventSafely(db, {
    eventType: "consultation.memo_created",
    eventSource: "memo_api",
    clientId: data.hospital_id ?? null,
    actorType: "admin",
    payload: { memoId: data.id, templateType: data.template_type },
    deduplicationKey: createEventDeduplicationKey("consultation.memo_created", data.id),
  });
  return data;
}

async function analyzeMemo(rawMemo: string, transcript: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY 미설정");
  const combined = [rawMemo, transcript ? `음성 전사:\n${transcript}` : ""].filter(Boolean).join("\n\n");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MEMO_MODEL || "gpt-4.1-mini",
      instructions: "당신은 병원 전문 브랜드 촬영 스튜디오 포토클리닉의 상담 AI 비서 올리비아입니다. 한국어 상담 메모에서 확인된 사실만 구조화하고, 없는 문자열은 빈 문자열, 목록은 빈 배열, 불리언은 false로 반환하세요. 대표와 고객의 약속은 담당 주체와 가능한 경우 ISO 날짜를 분리하세요. next_action과 nextAction에는 같은 값을 넣으세요.",
      input: combined,
      text: { format: { type: "json_schema", name: "consultation_analysis", strict: true, schema: analysisSchema } },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "AI 분석 실패");
  const content = outputText(json);
  if (!content) throw new Error("AI 응답 없음");
  try { return JSON.parse(content); } catch { throw new Error("AI 응답 파싱 실패"); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "save") {
      const memo = await saveMemo(body);
      return NextResponse.json({ ok: true, memo });
    }

    const rawMemo = String(body.raw_memo || "");
    const transcript = String(body.transcript || "");
    if (!rawMemo.trim() && !transcript.trim()) return NextResponse.json({ ok: false, error: "메모 내용을 입력해주세요." }, { status: 400 });
    const extracted = await analyzeMemo(rawMemo, transcript);

    // 기존 /consultation 및 고객 등록 폼 호환: persist=false가 아닌 분석은 기록으로 저장한다.
    let analyzedMemoId = body.id ? String(body.id) : "";
    if (body.persist !== false) {
      const db = getSupabaseAdmin();
      const { data: savedMemo, error: saveError } = await db.from("consultation_memos").insert({
        hospital_id: body.hospital_id || null,
        raw_memo: rawMemo,
        transcript,
        summary: extracted.summary || "",
        extracted_data: extracted,
        recommended_package: extracted.recommended_package || "",
        next_action: extracted.nextAction || extracted.next_action || "",
        title: body.title || extracted.hospital_name || "메모",
      }).select("id, hospital_id, created_at").single();
      if (saveError) throw saveError;
      analyzedMemoId = savedMemo.id;
      await emitOliviaEventSafely(db, {
        eventType: "consultation.memo_created",
        eventSource: "memo_api",
        clientId: savedMemo.hospital_id ?? null,
        actorType: "admin",
        payload: { memoId: savedMemo.id, analyzed: true },
        deduplicationKey: createEventDeduplicationKey("consultation.memo_created", savedMemo.id),
      });
    } else if (body.id) {
      const db = getSupabaseAdmin();
      await db.from("consultation_memos").update({
        summary: extracted.summary || "",
        extracted_data: extracted,
        recommended_package: extracted.recommended_package || "",
        next_action: extracted.nextAction || extracted.next_action || "",
      }).eq("id", body.id);
    }
    const db = getSupabaseAdmin();
    let linkedRun: any = null;
    if (body.hospital_id) {
      const { data } = await db.from("workflow_runs").select("id,project_id").eq("client_id", body.hospital_id).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      linkedRun = data;
    }
    await saveMeetingCommitments(db, extracted, {
      memoId: analyzedMemoId || null,
      clientId: body.hospital_id || null,
      projectId: linkedRun?.project_id ?? null,
      workflowRunId: linkedRun?.id ?? null,
    }).catch(() => []);
    await emitOliviaEventSafely(db, {
      eventType: "meeting.analyzed",
      eventSource: "memo_api",
      clientId: body.hospital_id || null,
      actorType: "admin",
      payload: {
        memoId: analyzedMemoId || null,
        confirmedItemCount: Array.isArray(extracted.confirmedItems) ? extracted.confirmedItems.length : 0,
        unresolvedItemCount: Array.isArray(extracted.unresolvedItems) ? extracted.unresolvedItems.length : 0,
        nextAction: extracted.nextAction || extracted.next_action || "",
      },
      deduplicationKey: analyzedMemoId
        ? createEventDeduplicationKey("meeting.analyzed", analyzedMemoId)
        : null,
    });
    return NextResponse.json({ ok: true, ...extracted });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "메모 처리 실패" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id 필수" }, { status: 400 });
  try {
    const item = await moveRecordToTrash(getSupabaseAdmin(), "consultation_memo", id);
    return NextResponse.json({ ok: true, trashId: item.id });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "메모 삭제 실패" }, { status: 500 });
  }
}
