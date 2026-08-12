import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fuzzyIncludes } from "@/lib/olivia/nameSearch";

const TYPE_KR: Record<string, string> = {
  quote: "견적서", contract: "계약서", conti: "콘티", original_files: "원본파일",
  gallery: "갤러리", review_form: "후기 요청", monthly_report: "리포트", proposal: "제안서",
};

// lib/assistant/core/legacyOliviaCore.ts의 executeTool()에서 그대로 옮긴 메일링 큐 조회/발송 —
// 레거시 Claude 경로와 v2 OpenAI 경로가 같은 구현을 공유한다.
export async function listMailingQueue(input: any) {
  const db = getSupabaseAdmin();
  let query = db.from("mailing_queue")
    .select("id, type, hospital_name, subject, status, to_email, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  if (input.status) {
    query = query.eq("status", input.status);
  } else {
    query = query.in("status", ["draft", "ready"]);
  }
  if (input.clientName) query = query.ilike("hospital_name", `%${input.clientName}%`);
  let { data: items } = await query;

  if ((!items || items.length === 0) && input.clientName) {
    let candidateQuery = db.from("mailing_queue")
      .select("id, type, hospital_name, subject, status, to_email, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    candidateQuery = input.status ? candidateQuery.eq("status", input.status) : candidateQuery.in("status", ["draft", "ready"]);
    const { data: candidates } = await candidateQuery;
    items = (candidates || []).filter((row: any) => fuzzyIncludes(row.hospital_name, input.clientName)).slice(0, 10);
  }

  if (!items || items.length === 0) {
    return { action: "done", message: "📭 대기 중인 메일이 없습니다." };
  }
  const list = items.map((m: any, i: number) =>
    `${i + 1}. **${m.hospital_name}** — ${TYPE_KR[m.type] ?? m.type} (${m.status})\n   ID: \`${m.id}\`\n   수신: ${m.to_email || "미입력"}`
  ).join("\n\n");
  return {
    action: "done",
    message: `📬 **대기 중인 메일 ${items.length}건**\n\n${list}\n\n특정 메일을 발송하려면 ID를 알려주세요.`,
    items,
  };
}

// req는 레거시(Claude) 경로에서만 넘어온다 — v2(OpenAI) 경로는 NextRequest 없이 runTool을 호출한다.
export async function sendMailing(input: any, req?: NextRequest | null) {
  const origin =
    req?.headers.get("x-base-url") || req?.headers.get("origin") ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  const res = await fetch(`${origin}/api/mailing/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-key": process.env.INTERNAL_API_KEY || "" },
    body: JSON.stringify({ id: input.mailingId }),
  });
  const d = await res.json();
  if (!d.ok) return { action: "done", message: `❌ 발송 실패: ${d.error}` };
  return { action: "done", message: `✅ 메일 발송 완료!\nID: \`${input.mailingId}\`` };
}
