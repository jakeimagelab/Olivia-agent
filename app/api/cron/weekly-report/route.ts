import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron 보안 검증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 지난 7일 활동 데이터 집계
  const { data: logs } = await supabaseAdmin
    .from("activity_logs")
    .select("*")
    .gte("created_at", weekAgo.toISOString());

  const counts = {
    create_quote:    0,
    create_conti:    0,
    send_file:       0,
    create_contract: 0,
    create_website:  0,
    olivia_chat:     0,
  };
  const hospitals = new Set<string>();

  (logs || []).forEach((log: any) => {
    const t = log.action_type as keyof typeof counts;
    if (t in counts) counts[t]++;
    if (log.hospital_name) hospitals.add(log.hospital_name);
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Claude로 인사이트 생성
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `포토클리닉 지난 주 업무 데이터:
- 견적서: ${counts.create_quote}건, 콘티: ${counts.create_conti}건
- 파일전송: ${counts.send_file}건, 계약서: ${counts.create_contract}건
- 홈페이지: ${counts.create_website}건, AI대화: ${counts.olivia_chat}회
- 총 ${total}건, 관련병원 ${hospitals.size}곳

한국어로 간결하게:
1. 이번 주 한 줄 요약
2. 잘한 점
3. 다음 주 집중할 점
4. 응원 메시지`,
      }],
    }),
  });
  const aiData = await anthropicRes.json();
  const insight = aiData.content?.[0]?.text || "이번 주도 수고하셨습니다! 🎉";

  const weekStr = `${weekAgo.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} ~ ${now.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}`;

  const statCard = (icon: string, label: string, value: number) => `
    <td style="padding:8px;">
      <div style="background:#F0F9F8;border-radius:12px;padding:16px;text-align:center;min-width:80px;">
        <div style="font-size:22px;margin-bottom:4px;">${icon}</div>
        <div style="font-size:24px;font-weight:900;color:#155855;">${value}</div>
        <div style="font-size:11px;color:#5A7470;margin-top:2px;">${label}</div>
      </div>
    </td>`;

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0F9F8;font-family:sans-serif;">
<div style="max-width:580px;margin:0 auto;padding:24px 16px;">

  <div style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
    <div style="font-size:10px;font-weight:700;letter-spacing:.2em;color:rgba(255,255,255,.6);text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC</div>
    <div style="font-size:22px;font-weight:900;color:#fff;">주간 업무 리포트</div>
    <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:6px;">${weekStr}</div>
  </div>
  <div style="height:4px;background:linear-gradient(90deg,#E85D2C,#EB8F22);"></div>

  <div style="background:#fff;padding:28px 32px;">
    <div style="font-size:12px;font-weight:800;color:#155855;margin-bottom:16px;text-transform:uppercase;letter-spacing:.1em;">📊 이번 주 활동</div>
    <table style="width:100%;border-collapse:collapse;"><tr>
      ${statCard("📄","견적서",counts.create_quote)}
      ${statCard("🎬","콘티",counts.create_conti)}
      ${statCard("📦","파일전송",counts.send_file)}
      ${statCard("✍️","계약서",counts.create_contract)}
      ${statCard("🌐","홈페이지",counts.create_website)}
      ${statCard("✨","AI대화",counts.olivia_chat)}
    </tr></table>

    <div style="margin-top:16px;background:linear-gradient(135deg,#155855,#1e7870);border-radius:12px;padding:16px 20px;">
      <table style="width:100%;"><tr>
        <td style="color:rgba(255,255,255,.8);font-size:13px;font-weight:700;">총 활동</td>
        <td style="text-align:right;color:#fff;font-size:26px;font-weight:900;">${total}건</td>
      </tr></table>
    </div>

    ${hospitals.size > 0 ? `
    <div style="margin-top:20px;">
      <div style="font-size:12px;font-weight:700;color:#5A7470;margin-bottom:8px;">🏥 이번 주 관련 병원 (${hospitals.size}곳)</div>
      <div>${Array.from(hospitals).map(h => `<span style="display:inline-block;background:#EAF4F2;color:#155855;font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;margin:3px;">${h}</span>`).join("")}</div>
    </div>` : ""}
  </div>

  <div style="background:#FFF8F5;border:1px solid #FACCB8;padding:24px 32px;">
    <div style="font-size:12px;font-weight:800;color:#E85D2C;margin-bottom:10px;">✨ 올리비아의 한마디</div>
    <div style="font-size:13px;color:#374151;line-height:1.8;white-space:pre-line;">${insight}</div>
  </div>

  <div style="background:#fff;border-radius:0 0 16px 16px;padding:18px 32px;text-align:center;border-top:1px solid #E5E7EB;">
    <div style="font-size:11px;color:#9CA3AF;">매주 월요일 오전 9시 올리비아 AI가 자동 발송합니다.</div>
  </div>

</div>
</body></html>`;

  // Gmail 발송
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"올리비아 AI" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: `📊 포토클리닉 주간 리포트 | ${weekStr}`,
    html,
  });

  return NextResponse.json({ ok: true, message: `주간 리포트 발송 완료 (${total}건)` });
}
