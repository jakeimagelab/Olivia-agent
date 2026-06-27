import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from("consultation_memos")
      .select("id, raw_memo, summary, extracted_data, recommended_package, next_action, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ ok: true, memos: data ?? [] });
  } catch {
    return NextResponse.json({ ok: false, memos: [] });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "OPENAI_API_KEY 미설정" }, { status: 500 });

  const { raw_memo, hospital_id } = await req.json();
  if (!raw_memo?.trim()) return NextResponse.json({ ok: false, error: "메모 내용을 입력해주세요." }, { status: 400 });

  const systemPrompt = `당신은 포토클리닉(병원 전문 브랜드 촬영) 영업 AI 비서 올리비아입니다.
상담/미팅 메모를 분석해 구조화된 정보를 추출합니다.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "summary": "상담 내용 1-2문장 요약",
  "hospital_name": "병원명",
  "manager_name": "담당자명",
  "phone": "연락처",
  "email": "이메일",
  "department": "진료과",
  "purpose": "촬영 목적",
  "shooting_items": ["촬영 항목 배열"],
  "doctors_count": "원장 수",
  "staff_count": "직원 수",
  "locations": "촬영 공간",
  "needs_video": true/false,
  "needs_website": true/false,
  "interested_in_sns": true/false,
  "preferred_date": "희망 촬영일",
  "budget": "예산",
  "special_notes": "특이사항",
  "recommended_package": "추천 패키지명",
  "next_action": "다음 액션 (예: 견적서 전달, 콘티 작성 등)"
}

정보가 없는 항목은 빈 문자열("")이나 false로 처리하세요.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `상담 메모:\n\n${raw_memo}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) return NextResponse.json({ ok: false, error: "AI 응답 없음" }, { status: 500 });

  let extracted: Record<string, unknown> = {};
  try { extracted = JSON.parse(content); } catch { return NextResponse.json({ ok: false, error: "응답 파싱 실패" }, { status: 500 }); }

  // Supabase에 저장
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("consultation_memos").insert({
      hospital_id: hospital_id || null,
      raw_memo,
      summary: extracted.summary || "",
      extracted_data: extracted,
      recommended_package: extracted.recommended_package || "",
      next_action: extracted.next_action || "",
    });
  } catch {}

  return NextResponse.json({ ok: true, ...extracted });
}
