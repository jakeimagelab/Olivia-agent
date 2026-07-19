import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db  = getSupabaseAdmin();
  const now = new Date();

  const targetDate = new Date(now);
  targetDate.setDate(targetDate.getDate() + 3);
  const targetDateStr = targetDate.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

  const { data: runs, error } = await db
    .from("workflow_runs")
    .select("id, client_id, client_name, project_name, contact_name, contact_email, shoot_date, reminder_sent_at")
    .eq("status", "active")
    .eq("shoot_date", targetDateStr)
    .is("reminder_sent_at", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!runs || runs.length === 0) {
    return NextResponse.json({ ok: true, message: "D-3 촬영 건 없음", processed: 0 });
  }

  const nowIso = now.toISOString();
  let processed = 0;

  for (const run of runs) {
    const subject = `[포토클리닉] ${run.client_name} 촬영 D-3 리마인드`;
    const body    = buildReminderEmailHtml({
      toName:       run.contact_name ?? run.client_name,
      hospitalName: run.client_name,
      shootDate:    run.shoot_date,
    });

    const [mailingInsert, runUpdate] = await Promise.all([
      db.from("mailing_queue").insert({
        type:           "shoot_reminder",
        status:         "draft",
        hospital_name:  run.client_name,
        client_id:      run.client_id ?? null,
        contact_name:   run.contact_name ?? run.client_name,
        to_email:       run.contact_email ?? "",
        subject,
        body,
        source_module:  "cron:shoot-reminder",
        workflow_run_id: run.id,
        created_at:     nowIso,
      }),
      db.from("workflow_runs")
        .update({ reminder_sent_at: nowIso, updated_at: nowIso })
        .eq("id", run.id),
    ]);

    if (mailingInsert.error || runUpdate.error) {
      console.error(`shoot-reminder failed for run ${run.id}:`, mailingInsert.error ?? runUpdate.error);
      continue;
    }

    processed++;
  }

  return NextResponse.json({ ok: true, processed, targetDate: targetDateStr });
}

function buildReminderEmailHtml(params: {
  toName: string;
  hospitalName: string;
  shootDate: string;
}): string {
  const { toName, hospitalName, shootDate } = params;
  const formattedDate = new Date(shootDate).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
      <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,.55);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC · 포토클리닉</div>
        <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">촬영 D-3 리마인드</div>
        <div style="font-size:13px;color:rgba(255,255,255,.7);margin-top:6px;">📅 ${formattedDate}</div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">
        <p style="font-size:15px;font-weight:800;color:#1C2B28;margin:0 0 6px;">안녕하세요. 포토클리닉입니다.</p>
        <p style="font-size:14px;font-weight:700;color:#1C2B28;margin:0 0 18px;">${toName} 원장님.</p>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;">
          ${hospitalName} 촬영이 <strong style="color:#155855;">3일 후(${formattedDate})</strong>로 예정되어 있습니다.<br>
          촬영 전 아래 사항을 미리 준비해 주시면 더 좋은 결과물을 만들 수 있습니다.
        </p>
        <div style="background:#EAF4F2;border-radius:12px;padding:20px 22px;margin-bottom:24px;">
          <div style="font-size:13px;font-weight:800;color:#155855;margin-bottom:12px;">📋 촬영 전 체크리스트</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#5A7470;line-height:2.0;">
            <li>촬영 당일 의상 준비 (단정한 가운 또는 컨셉 의상)</li>
            <li>병원 내부 청결 및 정리정돈</li>
            <li>촬영 희망 공간 사전 확인</li>
            <li>담당 스태프 일정 확인</li>
          </ul>
        </div>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:0;">
          궁금하신 사항은 언제든지 연락 주세요.<br>
          좋은 촬영으로 찾아뵙겠습니다. 감사합니다.
        </p>
        <p style="font-size:12px;color:#9BB5B0;border-top:1px solid #EEF4F3;padding-top:16px;margin:24px 0 0;line-height:1.8;">
          포토클리닉 대표 정연호 드림.
        </p>
      </td></tr>
      <tr><td style="background:#EAF4F2;border-radius:0 0 16px 16px;padding:16px 32px;border:1px solid #C8DDD9;border-top:none;text-align:center;">
        <div style="font-size:10px;color:#7C9893;line-height:1.7;">PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
