import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCUMENT_SOURCE_TABLES = [
  "workflow_artifacts",
  "consultation_memos",
  "photo_galleries",
  "select_galleries",
  "conti_runs",
  "conti_saves",
] as const;

async function rowFromTable(table: string, id: string) {
  const { data, error } = await getSupabaseAdmin().from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function firstMatchingRow(tables: readonly string[], id: string) {
  for (const table of tables) {
    const data = await rowFromTable(table, id);
    if (data) return { data, sourceType: table };
  }
  return null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  try {
    const { type, id } = await context.params;
    if (!id) return NextResponse.json({ ok: false, error: "문서 ID가 필요합니다." }, { status: 400 });

    let result: { data: Record<string, unknown>; sourceType: string } | null = null;
    if (type === "quote") {
      const data = await rowFromTable("quotes", id);
      if (data) result = { data, sourceType: "quotes" };
    } else if (type === "contract") {
      const data = await rowFromTable("contracts", id);
      if (data) result = { data, sourceType: "contracts" };
    } else if (type === "storyboard") {
      result = await firstMatchingRow(["conti_runs", "conti_saves"], id);
    } else if (type === "document") {
      const { data: temporary } = await getSupabaseAdmin()
        .from("temporary_documents")
        .select("source_table,title,hospital_name,status")
        .eq("source_id", id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sourceTable = typeof temporary?.source_table === "string" && DOCUMENT_SOURCE_TABLES.includes(temporary.source_table as typeof DOCUMENT_SOURCE_TABLES[number])
        ? temporary.source_table
        : null;
      if (sourceTable) {
        const source = await rowFromTable(sourceTable, id);
        if (source) result = {
          data: { ...source, title: source.title || temporary?.title, hospital_name: source.hospital_name || temporary?.hospital_name, status: source.status || temporary?.status },
          sourceType: sourceTable,
        };
      }
      if (!result) result = await firstMatchingRow(DOCUMENT_SOURCE_TABLES, id);
    } else {
      return NextResponse.json({ ok: false, error: "지원하지 않는 문서 종류입니다." }, { status: 400 });
    }

    if (!result) return NextResponse.json({ ok: false, error: "문서를 찾을 수 없어요." }, { status: 404 });

    if (result.sourceType === "conti_runs") {
      const [groupsResult, scenesResult] = await Promise.all([
        getSupabaseAdmin().from("conti_groups").select("*").eq("run_id", id).order("sort"),
        getSupabaseAdmin().from("conti_scenes").select("*").eq("run_id", id).order("sort"),
      ]);
      result.data = { ...result.data, groups: groupsResult.data ?? [], scenes: scenesResult.data ?? [] };
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "문서를 불러오지 못했어요." }, { status: 500 });
  }
}
