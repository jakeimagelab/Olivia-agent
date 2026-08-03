import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { matchClient } from "@/lib/clientMatching";
import { ensurePortalAccess } from "@/lib/clientPortal";
import { buildNextAction, createStepTasks, ensureStepRun, logAgent } from "@/lib/workflowAutomation";
import { recordPcrmActivitySafely } from "@/lib/pcrm/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createClientFromQuote(db: SupabaseClient, quote: any): Promise<string> {
  const { data, error } = await db
    .from("clients")
    .insert({
      hospital_name: quote.hospital_name || "",
      contact_name: quote.contact_name || "",
      phone: quote.phone || "",
      email: quote.email || "",
      business_registration_number: quote.business_registration_number || null,
      lead_status: "lead",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// 견적서를 고객 포털에 처음 공개할 때: 고객 자동 연결/생성 → 프로젝트(워크플로우) 자동 시작 →
// 포털 자동 발급까지 한 번에 처리한다. 재공개(수정 후 다시 공개)는 같은 프로젝트를 재사용하되
// 이미 고객이 열람/응답한 이력(status가 draft가 아님)이 있으면 새 버전으로 남긴다.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getSupabaseAdmin();
  const body = await req.json().catch(() => ({} as any));

  const { data: quote, error: quoteError } = await db.from("quotes").select("*").eq("id", id).maybeSingle();
  if (quoteError) return NextResponse.json({ ok: false, error: quoteError.message }, { status: 500 });
  if (!quote) return NextResponse.json({ ok: false, error: "견적서를 찾을 수 없습니다." }, { status: 404 });

  try {
    let clientId: string | null = quote.client_id ?? null;

    if (!clientId) {
      if (body.forceClientId) {
        clientId = body.forceClientId;
      } else if (body.forceCreateNew) {
        clientId = await createClientFromQuote(db, quote);
      } else {
        const match = await matchClient(db, {
          businessRegistrationNumber: quote.business_registration_number,
          email: quote.email,
          phone: quote.phone,
          hospitalName: quote.hospital_name,
        });
        if (match.status === "matched") {
          clientId = match.clientId;
        } else if (match.status === "needs_confirmation") {
          return NextResponse.json({ ok: false, needsConfirmation: true, candidate: match.candidate }, { status: 409 });
        } else {
          clientId = await createClientFromQuote(db, quote);
        }
      }
    }
    if (!clientId) throw new Error("고객을 확인하지 못했습니다.");

    // 프로젝트(워크플로우) 자동 시작 — 이 견적서에 이미 연결된 프로젝트가 없을 때만 새로 만든다.
    // 같은 고객이라도 새 견적서는 새 프로젝트가 된다(고객 1:N 프로젝트).
    let workflowRunId: string | null = quote.workflow_run_id ?? null;
    if (!workflowRunId) {
      const { data: client } = await db.from("clients").select("hospital_name, contact_name").eq("id", clientId).maybeSingle();
      const projectName = quote.title || `${quote.hospital_name || client?.hospital_name || "고객"} 촬영`;
      const { data: run, error: runError } = await db
        .from("workflow_runs")
        .insert({
          client_id: clientId,
          client_name: quote.hospital_name || client?.hospital_name || "",
          project_name: projectName,
          manager_name: quote.contact_name || client?.contact_name || "",
          contact_name: quote.contact_name || "",
          contact_email: quote.email || "",
          shoot_date: quote.shoot_date || null,
          current_step_key: "quote",
          next_action: buildNextAction("quote"),
          status: "active",
          template_id: "11111111-1111-1111-1111-111111111111",
        })
        .select()
        .single();
      if (runError) throw new Error(runError.message);
      const newRunId = run.id as string;
      workflowRunId = newRunId;
      await ensureStepRun(db, newRunId, "quote", "in_progress");
      await createStepTasks(db, newRunId, "quote");
      await logAgent(db, {
        workflow_run_id: newRunId,
        log_type: "workflow_started",
        message: `${projectName} 워크플로우가 견적서 공개로 자동 시작되었습니다.`,
      });
    }

    await db.from("quotes").update({ client_id: clientId, workflow_run_id: workflowRunId, status: "published" }).eq("id", id);

    const now = new Date().toISOString();
    const { data: existingPub } = await db
      .from("pcrm_publications")
      .select("id, version, status")
      .eq("workflow_run_id", workflowRunId)
      .eq("related_type", "quote")
      .eq("related_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingPub && existingPub.status === "draft") {
      await db.from("pcrm_publications").update({ status: "published", published_at: now, updated_at: now }).eq("id", existingPub.id);
    } else if (existingPub) {
      // 고객이 이미 열람/승인/수정요청한 뒤 다시 공개하는 경우 — 새 버전으로 남겨 이력을 보존한다.
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "quote",
        related_id: id,
        title: quote.title || quote.quote_number || "견적서",
        version: existingPub.version + 1,
        status: "published",
        published_at: now,
        created_by: "admin",
      });
    } else {
      await db.from("pcrm_publications").insert({
        client_id: clientId,
        workflow_run_id: workflowRunId,
        related_type: "quote",
        related_id: id,
        title: quote.title || quote.quote_number || "견적서",
        status: "published",
        published_at: now,
        created_by: "admin",
      });
    }

    const portal = await ensurePortalAccess({ clientId, workflowRunId, email: quote.email || undefined, expiresInDays: 90 });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
    const portalUrl = `${baseUrl}/client-portal/access/${portal.token}`;

    await recordPcrmActivitySafely(db, {
      clientId,
      workflowRunId,
      actorType: "admin",
      actorName: "관리자",
      actionType: "quote_published",
      title: "견적서가 고객 포털에 공개됨",
      relatedType: "quote",
      relatedId: id,
    });

    return NextResponse.json({ ok: true, clientId, workflowRunId, portalUrl });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "견적서 공개 실패" }, { status: 500 });
  }
}
