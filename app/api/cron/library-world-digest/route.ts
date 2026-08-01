import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 매주 월요일 — 세계 경제·비즈니스·기술 이슈 5건을 웹검색으로 수집해 라이브러리에 추가한다.
export async function GET() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: [
          "이번 주(최근 7일) 세계 경제·비즈니스·기술 관련 주요 이슈 5개를 웹검색으로 찾아서,",
          "각각 한국 중소기업 대표가 이해하기 쉽게 3~4문장으로 요약해줘.",
          "검색과 요약이 끝나면 반드시 마지막 응답으로 아래 JSON 배열만 반환해(다른 텍스트 없이):",
          '[{"summary":"...", "region":"...", "topic":"경제|기술|정치|산업", "source_url":"...", "published_date":"YYYY-MM-DD"}]',
        ].join("\n"),
      }],
    }),
  });

  const json = await res.json();
  const text = (json.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  let items: any[] = [];
  try { items = jsonMatch ? JSON.parse(jsonMatch[0]) : []; } catch { items = []; }

  const db = getSupabaseAdmin();
  for (const it of items) {
    if (!it.summary) continue;
    await db.from("library_items").insert({
      category: "world_issue",
      title: String(it.summary).slice(0, 40),
      content: it,
      tags: [it.topic].filter(Boolean),
      source: it.source_url ?? null,
    });
  }

  return NextResponse.json({ ok: true, added: items.length });
}
