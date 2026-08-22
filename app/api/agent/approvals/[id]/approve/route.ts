import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { approveWorkflowItem } from "@/lib/workflowAutomation";
import { getErrorMessage } from "@/lib/errors";
import { resumeAgentRunsForApproval } from "@/lib/olivia/agentRuns/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const db=getSupabaseAdmin();
    const approval = await approveWorkflowItem(db, id, body.memo ?? "");
    await resumeAgentRunsForApproval(db,id);
    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
