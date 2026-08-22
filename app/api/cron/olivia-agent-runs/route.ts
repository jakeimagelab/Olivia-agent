import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { claimAgentRuns } from "@/lib/olivia/agentRuns/service";
import { executeClaimedAgentRun } from "@/lib/olivia/agentRuns/executor";

export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 60;
async function runWorker(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok:false,error:"Unauthorized"},{status:401});
  const db = getSupabaseAdmin(); const workerId = `cron-${crypto.randomUUID()}`;
  try {
    const claimed = await claimAgentRuns(db, workerId, 3);
    const results = await Promise.allSettled(claimed.map((run) => executeClaimedAgentRun(db, run)));
    return NextResponse.json({ ok:true, claimed:claimed.length, completed:results.filter((r)=>r.status==="fulfilled").length, failed:results.filter((r)=>r.status==="rejected").length });
  } catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Worker 실패"},{status:500});}
}
export const POST=runWorker;
export const GET=runWorker;
