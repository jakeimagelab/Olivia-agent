import { NextResponse } from "next/server";
import { runTrendCollection } from "@/lib/trend/collect";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 대시보드의 "지금 수집" 버튼에서 호출하는 수동 트리거
export async function POST() {
  await runTrendCollection();
  return NextResponse.json({ ok: true });
}
