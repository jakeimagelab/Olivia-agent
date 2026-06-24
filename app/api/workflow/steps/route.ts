import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WORKFLOW_STEPS } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.from("workflow_steps").select("*").order("order_index", { ascending: true });
    if (error) throw error;

    const knownKeys = new Set(WORKFLOW_STEPS.map(s => s.key));
    const dbStepsAreOutdated = !data?.length || !data.some(s => knownKeys.has(s.key ?? s.step_key));
    if (dbStepsAreOutdated) {
      return NextResponse.json({ ok: true, steps: WORKFLOW_STEPS });
    }

    return NextResponse.json({ ok: true, steps: data });
  } catch (error) {
    return NextResponse.json({ ok: true, mock: true, note: error instanceof Error ? error.message : String(error), steps: WORKFLOW_STEPS });
  }
}
