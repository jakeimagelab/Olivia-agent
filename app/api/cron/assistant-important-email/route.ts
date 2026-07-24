import { NextRequest, NextResponse } from "next/server";
import { scanAndNotifyImportantEmails } from "@/lib/assistant/notifications/importantEmailService";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanAndNotifyImportantEmails(getSupabaseAdmin());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "중요 메일 확인에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}
