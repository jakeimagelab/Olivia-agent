import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createMobileResourceShareToken } from "@/lib/olivia/mobile/resourceShares";
import type { MobileResourceType } from "@/lib/olivia/mobile/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  try {
    const { type, id } = await context.params;
    if (type !== "quote" && type !== "contract") {
      return NextResponse.json({ ok: false, error: "공유할 수 없는 문서입니다." }, { status: 400 });
    }
    const table = type === "quote" ? "quotes" : "contracts";
    const { data, error } = await getSupabaseAdmin().from(table).select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "문서를 찾을 수 없습니다." }, { status: 404 });
    const share = createMobileResourceShareToken(type as MobileResourceType, id);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin || "https://olivia.photoclinic.kr";
    return NextResponse.json({ ok: true, ...share, url: `${baseUrl.replace(/\/$/, "")}/resource-preview/m/${share.token}` });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "공유 링크를 만들지 못했어요." }, { status: 500 });
  }
}

