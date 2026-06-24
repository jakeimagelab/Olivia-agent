import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Claude로 아이디어 생성
async function generateIdeas(dateStr: string) {
  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()];

  const prompt = `오늘은 ${dateStr} (${dayOfWeek}요일)입니다.

당신은 한국 병원 브랜딩 전문 마케팅 컨설턴트입니다.
포토클리닉(제이크이미지연구소)은 병원·의원 전문 사진 촬영 스튜디오입니다.
대표는 정연호님으로, 병원 브랜딩 사진 촬영, 콘텐츠 제작, 홈페이지 제작을 합니다.

오늘 대표님이 바로 실행할 수 있는 마케팅 & 고객 관리 아이디어를 만들어주세요.
답변은 반드시 아래 JSON 형식으로만 반환하세요 (다른 텍스트 없이):

{
  "marketing_idea": {
    "title": "오늘의 마케팅 아이디어 제목 (20자 이내)",
    "body": "구체적인 실행 방법 (150자 이내, 왜 지금 해야 하는지 포함)",
    "action": "지금 당장 할 수 있는 1가지 실행 항목"
  },
  "content_ideas": [
    {
      "platform": "인스타그램",
      "title": "포스팅 주제 제목",
      "caption_hook": "첫 문장 훅 (사람들이 멈추게 하는 문구)",
      "body": "포스팅 내용 방향 (100자 이내)"
    },
    {
      "platform": "블로그/네이버",
      "title": "포스팅 주제 제목",
      "caption_hook": "제목 훅",
      "body": "포스팅 내용 방향 (100자 이내)"
    }
  ],
  "customer_tip": {
    "title": "고객 관리 팁 제목",
    "body": "오늘 연락할 고객 유형 또는 관리 방법 (100자 이내)",
    "script": "실제로 사용할 수 있는 카카오톡/문자 예시 문구"
  },
  "mission": {
    "title": "오늘의 미션 (한 줄)",
    "why": "이 미션을 오늘 해야 하는 이유",
    "estimated_time": "예상 소요시간 (예: 30분)"
  },
  "trend_keywords": ["트렌드키워드1", "트렌드키워드2", "트렌드키워드3"]
}

아이디어 작성 기준:
- 병원 사진 스튜디오에 특화된 아이디어 (일반적인 마케팅 팁 금지)
- 오늘 바로 실행 가능한 수준의 구체성
- 요일 특성 반영 (월요일이면 주간 계획, 금요일이면 주말 전 팔로업 등)
- 계절/시기 반영 (지금이 ${dateStr}임을 고려)
- 병원 개원 시즌, 의사 사진 리뉴얼 니즈, SNS 콘텐츠 트렌드 등 반영`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  const text = data.content?.[0]?.text || "";

  // JSON 파싱
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("JSON 파싱 실패: " + text.slice(0, 200));
  return JSON.parse(jsonMatch[0]);
}

// HTML 이메일 생성
function buildEmail(ideas: any, dateStr: string) {
  const dayOfWeek = ["일", "월", "화", "수", "목", "금", "토"][new Date().getDay()];

  const contentCard = (idea: any, i: number) => `
  <div style="background:#fff;border:1px solid #E5ECEB;border-radius:12px;padding:18px 20px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="background:${i === 0 ? "#E85D2C" : "#155855"};color:#fff;font-size:10px;font-weight:800;padding:3px 10px;border-radius:99px;">${idea.platform}</span>
    </div>
    <div style="font-size:15px;font-weight:800;color:#1C2B28;margin-bottom:6px;">${idea.title}</div>
    <div style="background:#FFF8F5;border-left:3px solid #E85D2C;padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:8px;">
      <div style="font-size:11px;color:#E85D2C;font-weight:700;margin-bottom:2px;">첫 문장 훅</div>
      <div style="font-size:13px;color:#374151;font-weight:600;">"${idea.caption_hook}"</div>
    </div>
    <div style="font-size:12px;color:#5A7470;line-height:1.7;">${idea.body}</div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px 16px;">

  <!-- 헤더 -->
  <div style="background:linear-gradient(135deg,#155855,#1C3F3C);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <div style="font-size:10px;font-weight:700;letter-spacing:.2em;color:rgba(255,255,255,.5);text-transform:uppercase;margin-bottom:6px;">OLIVIA × PHOTO CLINIC</div>
    <div style="font-size:24px;font-weight:900;color:#fff;margin-bottom:4px;">오늘의 마케팅 아이디어 ✨</div>
    <div style="font-size:13px;color:rgba(255,255,255,.7);">${dateStr} (${dayOfWeek}요일)</div>
  </div>
  <div style="height:4px;background:linear-gradient(90deg,#E85D2C,#EB8F22);"></div>

  <div style="background:#fff;padding:28px 32px;">

    <!-- 오늘의 마케팅 아이디어 -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:800;color:#155855;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">📣 오늘의 마케팅 아이디어</div>
      <div style="background:linear-gradient(135deg,#EDF5F3,#E0F0EC);border-radius:14px;padding:20px 22px;border:1px solid #C8DDD9;">
        <div style="font-size:18px;font-weight:900;color:#155855;margin-bottom:10px;">${ideas.marketing_idea.title}</div>
        <div style="font-size:13px;color:#3A5450;line-height:1.8;margin-bottom:14px;">${ideas.marketing_idea.body}</div>
        <div style="background:#155855;border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
          <div style="color:#EB8F22;font-size:16px;flex-shrink:0;">▶</div>
          <div style="color:#fff;font-size:13px;font-weight:700;">${ideas.marketing_idea.action}</div>
        </div>
      </div>
    </div>

    <!-- SNS 콘텐츠 아이디어 -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:800;color:#155855;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">📱 오늘의 콘텐츠 아이디어</div>
      ${(ideas.content_ideas || []).map((idea: any, i: number) => contentCard(idea, i)).join("")}
    </div>

    <!-- 고객 관리 팁 -->
    <div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:800;color:#155855;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px;">💬 오늘의 고객 관리 팁</div>
      <div style="background:#fff;border:1px solid #E5ECEB;border-radius:12px;padding:18px 20px;">
        <div style="font-size:15px;font-weight:800;color:#1C2B28;margin-bottom:8px;">${ideas.customer_tip.title}</div>
        <div style="font-size:13px;color:#5A7470;line-height:1.7;margin-bottom:12px;">${ideas.customer_tip.body}</div>
        <div style="background:#F0FDF4;border-radius:10px;padding:14px 16px;">
          <div style="font-size:10px;font-weight:700;color:#22876A;margin-bottom:6px;">📨 카카오톡/문자 예시</div>
          <div style="font-size:13px;color:#1C2B28;line-height:1.7;font-style:italic;">"${ideas.customer_tip.script}"</div>
        </div>
      </div>
    </div>

    <!-- 오늘의 미션 -->
    <div style="background:linear-gradient(135deg,#E85D2C,#EB8F22);border-radius:14px;padding:20px 22px;text-align:center;">
      <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.7);letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">TODAY'S MISSION</div>
      <div style="font-size:18px;font-weight:900;color:#fff;margin-bottom:8px;">${ideas.mission.title}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.85);line-height:1.7;margin-bottom:10px;">${ideas.mission.why}</div>
      <div style="background:rgba(255,255,255,.2);display:inline-block;padding:5px 16px;border-radius:99px;">
        <span style="color:#fff;font-size:12px;font-weight:700;">⏱ ${ideas.mission.estimated_time}</span>
      </div>
    </div>

    <!-- 트렌드 키워드 -->
    ${ideas.trend_keywords?.length ? `
    <div style="margin-top:20px;">
      <div style="font-size:11px;color:#9BB5B0;margin-bottom:8px;">오늘의 트렌드 키워드</div>
      <div>${(ideas.trend_keywords as string[]).map(k => `<span style="display:inline-block;background:#EDF5F3;color:#155855;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;margin:3px;">#${k}</span>`).join("")}</div>
    </div>` : ""}
  </div>

  <!-- 푸터 -->
  <div style="background:#fff;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;border-top:1px solid #E5ECEB;">
    <div style="font-size:11px;color:#9BB5B0;line-height:1.8;">
      올리비아 AI가 매일 아침 8시에 자동으로 발송합니다.<br/>
      PHOTO CLINIC · 제이크이미지연구소 · @photoclinic_kr
    </div>
  </div>

</div>
</body></html>`;
}

// ── Cron endpoint ──────────────────────────────────────────
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const dateKey = today.toISOString().slice(0, 10); // YYYY-MM-DD

  try {
    // 이미 오늘 생성된 아이디어가 있으면 스킵
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from("daily_ideas")
      .select("id")
      .eq("date", dateKey)
      .single();

    if (existing) {
      return NextResponse.json({ ok: true, message: "이미 오늘 아이디어가 생성됨", skipped: true });
    }

    // Claude로 아이디어 생성
    const ideas = await generateIdeas(dateStr);

    // Supabase 저장
    const { error: dbErr } = await supabase.from("daily_ideas").insert({
      date: dateKey,
      marketing_idea: ideas.marketing_idea,
      content_ideas: ideas.content_ideas,
      customer_tip: ideas.customer_tip,
      mission: ideas.mission,
      trend_keywords: ideas.trend_keywords,
    });
    if (dbErr) console.error("Supabase 저장 오류:", dbErr);

    // 이메일 발송
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: `"올리비아 AI" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_USER,
      subject: `✨ 오늘의 마케팅 아이디어 | ${dateStr}`,
      html: buildEmail(ideas, dateStr),
    });

    return NextResponse.json({ ok: true, message: `${dateStr} 아이디어 생성 및 발송 완료` });
  } catch (e: any) {
    console.error("daily-ideas cron error:", e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
