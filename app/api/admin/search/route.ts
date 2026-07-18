import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ALL_TOOLS } from "@/lib/toolNav";
import { filterAdminTools, sanitizePostgrestSearch, type AdminSearchResult } from "@/lib/adminSearch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawQuery = request.nextUrl.searchParams.get("q") || "";
  const query = sanitizePostgrestSearch(rawQuery);
  const tools = filterAdminTools(ALL_TOOLS, rawQuery).slice(0, 8);
  if (query.length < 2) return NextResponse.json({ ok: true, customers: [], projects: [], tools });

  const db = getSupabaseAdmin();
  const [customersResult, projectsResult] = await Promise.all([
    db.from("clients")
      .select("id,hospital_name,contact_name,specialty")
      .or(`hospital_name.ilike.%${query}%,contact_name.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(6),
    db.from("workflow_runs")
      .select("id,client_id,client_name,project_name,current_step_key,status,updated_at")
      .or(`client_name.ilike.%${query}%,project_name.ilike.%${query}%`)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const customers: AdminSearchResult[] = (customersResult.data || []).map((row) => ({
    id: row.id,
    kind: "customer",
    title: row.hospital_name || "이름 없는 고객",
    subtitle: [row.contact_name, row.specialty].filter(Boolean).join(" · ") || "고객 정보",
    href: `/clients?id=${encodeURIComponent(row.id)}`,
  }));
  const projects: AdminSearchResult[] = (projectsResult.data || []).map((row) => ({
    id: row.id,
    kind: "project",
    title: row.project_name || row.client_name || "고객 프로젝트",
    subtitle: [row.client_name, row.current_step_key, row.status].filter(Boolean).join(" · "),
    href: `/clients?workflowRunId=${encodeURIComponent(row.id)}`,
  }));

  const errors = [customersResult.error?.message, projectsResult.error?.message].filter(Boolean);
  return NextResponse.json({ ok: errors.length < 2, customers, projects, tools, partial: errors.length > 0, error: errors.join(" / ") || undefined });
}
