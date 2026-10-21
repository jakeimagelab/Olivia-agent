import { NextRequest, NextResponse } from "next/server";
import { getCanonicalConti } from "@/lib/conti/canonicalService";
import { recommendContiScenes } from "@/lib/conti/sceneRecommendations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const document = await getCanonicalConti(id);
    const doctors = Array.isArray(document.run.doctors) ? document.run.doctors as Array<{ name?: unknown }> : [];
    const result = await recommendContiScenes({
      specialty: String(document.run.specialty ?? ""),
      existingSceneNames: document.scenes.map((scene) => String(scene.name ?? "")).filter(Boolean),
      doctorNames: doctors.map((doctor) => String(doctor.name ?? "").trim()).filter(Boolean),
      doctorCount: Number(document.run.doctor_count) || 1,
      intent: typeof body.intent === "string" ? body.intent.slice(0, 400) : "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "추천 장면을 불러오지 못했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: /찾을 수 없습니다/.test(message) ? 404 : 500 });
  }
}
