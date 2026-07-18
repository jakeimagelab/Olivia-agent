import { NextRequest, NextResponse } from "next/server";
import { benchmarkHospitals } from "@/lib/channelAnalysis";
import { getErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await benchmarkHospitals({
      hospitalName: String(body.hospitalName || "").trim(),
      specialty: String(body.specialty || "").trim(),
      address: String(body.address || "").trim(),
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 400 });
  }
}
