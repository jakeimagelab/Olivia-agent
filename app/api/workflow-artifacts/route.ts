import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveClientId } from "@/lib/clientLookup";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WORKFLOW_ARTIFACT_TYPES, type WorkflowArtifactType } from "@/lib/workflowArtifacts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "workflow-artifacts";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const workflowRunId = searchParams.get("workflowRunId");
  if (!clientId && !workflowRunId) {
    return NextResponse.json({ ok: false, error: "clientId 또는 workflowRunId가 필요합니다." }, { status: 400 });
  }

  let query = db.from("workflow_artifacts")
    .select("id,client_id,workflow_run_id,workflow_step_key,document_type,source_table,source_id,title,file_name,mime_type,file_size,status,created_at")
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  if (workflowRunId) query = query.eq("workflow_run_id", workflowRunId);
  else if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, artifacts: data ?? [] });
}
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SOURCE_TABLE: Record<WorkflowArtifactType, "quotes" | "contracts" | "conti_saves"> = {
  quote: "quotes",
  contract: "contracts",
  conti: "conti_saves",
};

function safeFileName(value: string) {
  return value.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "document.pdf";
}

async function latestWorkflowRunId(db: ReturnType<typeof getSupabaseAdmin>, clientId: string) {
  const { data } = await db.from("workflow_runs")
    .select("id")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  let uploadedPath = "";
  try {
    const form = await req.formData();
    const file = form.get("file");
    const documentType = String(form.get("documentType") || "") as WorkflowArtifactType;
    const sourceTable = String(form.get("sourceTable") || "");
    const sourceId = String(form.get("sourceId") || "");
    const hospitalName = String(form.get("hospitalName") || "");
    const requestedClientId = String(form.get("clientId") || "");
    const requestedRunId = String(form.get("workflowRunId") || "");

    if (!(file instanceof File) || file.type !== "application/pdf") {
      return NextResponse.json({ ok: false, error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ ok: false, error: "PDF는 25MB 이하만 저장할 수 있습니다." }, { status: 400 });
    }
    if (!WORKFLOW_ARTIFACT_TYPES.includes(documentType) || SOURCE_TABLE[documentType] !== sourceTable || !sourceId) {
      return NextResponse.json({ ok: false, error: "자료 연결 정보가 올바르지 않습니다." }, { status: 400 });
    }

    const clientId = requestedClientId || await resolveClientId(db, hospitalName);
    if (!clientId) return NextResponse.json({ ok: false, error: "연결할 고객을 찾지 못했습니다." }, { status: 400 });

    let workflowRunId = requestedRunId || await latestWorkflowRunId(db, clientId) || null;
    if (workflowRunId) {
      const { data: run } = await db.from("workflow_runs").select("id,client_id").eq("id", workflowRunId).maybeSingle();
      if (!run || run.client_id !== clientId) {
        return NextResponse.json({ ok: false, error: "고객과 워크플로우 연결이 일치하지 않습니다." }, { status: 400 });
      }
    }

    const { data: source } = await db.from(sourceTable).select("id,client_id").eq("id", sourceId).maybeSingle();
    if (!source) return NextResponse.json({ ok: false, error: "원본 문서 데이터를 찾지 못했습니다." }, { status: 404 });
    if (source.client_id && source.client_id !== clientId) {
      return NextResponse.json({ ok: false, error: "원본 문서의 고객 연결이 일치하지 않습니다." }, { status: 400 });
    }

    const { data: existing } = await db.from("workflow_artifacts")
      .select("id,storage_path")
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .eq("document_type", documentType)
      .maybeSingle();
    const artifactId = existing?.id || randomUUID();
    const fileName = safeFileName(String(form.get("fileName") || file.name));
    uploadedPath = `${clientId}/${workflowRunId || "unassigned"}/${documentType}/${artifactId}/${fileName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await db.storage.from(BUCKET).upload(uploadedPath, buffer, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw new Error(uploadError.message);

    const metadata = {
      id: artifactId,
      client_id: clientId,
      workflow_run_id: workflowRunId,
      workflow_step_key: documentType,
      document_type: documentType,
      source_table: sourceTable,
      source_id: sourceId,
      title: String(form.get("title") || fileName),
      file_name: fileName,
      storage_path: uploadedPath,
      mime_type: "application/pdf",
      file_size: file.size,
      status: "ready",
      updated_at: new Date().toISOString(),
    };
    const { data: artifact, error: metadataError } = await db.from("workflow_artifacts")
      .upsert(metadata, { onConflict: "source_table,source_id,document_type" })
      .select("id,client_id,workflow_run_id,workflow_step_key,document_type,source_table,source_id,title,file_name,mime_type,file_size,status,created_at")
      .single();
    if (metadataError) {
      await db.storage.from(BUCKET).remove([uploadedPath]);
      throw new Error(metadataError.message);
    }

    if (existing?.storage_path && existing.storage_path !== uploadedPath) {
      await db.storage.from(BUCKET).remove([existing.storage_path]);
    }
    await db.from(sourceTable).update({ client_id: clientId, workflow_run_id: workflowRunId }).eq("id", sourceId);
    return NextResponse.json({ ok: true, artifact });
  } catch (error) {
    console.error("workflow-artifacts upload failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "원본 PDF 업로드 실패" }, { status: 500 });
  }
}
