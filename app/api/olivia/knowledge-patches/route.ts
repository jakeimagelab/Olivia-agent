import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function knowledgeErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("public.olivia_knowledge_patches") && message.includes("schema cache")) {
    return "지식 패치 DB가 아직 준비되지 않았습니다. Supabase SQL Editor에서 20260728_olivia_knowledge_and_suggestions.sql을 실행해주세요.";
  }
  return message;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const includeInactive = searchParams.get("includeInactive") === "1";

    let query = supabase
      .from("olivia_knowledge_patches")
      .select("*")
      .order("created_at", { ascending: false });
    if (category) query = query.eq("category", category);
    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, patches: data ?? [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: knowledgeErrorMessage(error, "지식 패치 조회 실패") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();

    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ ok: false, error: "패치 제목을 입력해주세요." }, { status: 400 });
    }
    if (typeof body.content !== "string" || !body.content.trim()) {
      return NextResponse.json({ ok: false, error: "패치 내용을 입력해주세요." }, { status: 400 });
    }

    const payload = {
      title: body.title.trim(),
      category: body.category ?? "",
      content: body.content.trim(),
      created_by: body.createdBy ?? "",
    };

    const { data, error } = await supabase
      .from("olivia_knowledge_patches")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, patch: data });
  } catch (error) {
    return NextResponse.json({ ok: false, error: knowledgeErrorMessage(error, "지식 패치 저장 실패") }, { status: 500 });
  }
}
