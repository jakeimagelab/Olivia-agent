import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/telegram/setup — Telegram 웹훅 URL 등록
export async function GET(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN 환경변수 미설정" });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!baseUrl) {
    return NextResponse.json({
      ok: false,
      error: "NEXT_PUBLIC_BASE_URL 환경변수 미설정. Vercel 프로젝트 설정에서 추가해주세요.",
    });
  }

  const webhookUrl = `${baseUrl}/api/telegram`;

  const res = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
      }),
    }
  ).then(r => r.json());

  return NextResponse.json({
    webhookUrl,
    result: res,
    message: res.ok
      ? `✅ 웹훅 등록 완료: ${webhookUrl}`
      : `❌ 등록 실패: ${res.description}`,
  });
}
