import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildNasShareUrl(clientName: string, projectName: string): string {
  // TODO: NAS 연동 시 실제 Synology/QNAP 공유링크 API로 교체
  const slug = encodeURIComponent(`${clientName}_${projectName}`);
  return `https://nas.photoclinic.local/share/${slug}`;
}

function buildOriginalDeliveryEmailHtml(params: {
  toName: string;
  hospitalName: string;
  shootDate: string | null;
  nasLink: string;
}): string {
  const { toName, hospitalName, shootDate, nasLink } = params;
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://photoclinic-diangnoisis.vercel.app";
  const reviewUrl = `${baseUrl}/review?hospital=${encodeURIComponent(hospitalName)}&name=${encodeURIComponent(toName)}`;

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
      <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,.55);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC · 포토클리닉</div>
        <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">원본 데이터 공유드립니다</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);">${today}</div>
      </td></tr>
      <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">
        <p style="font-size:15px;font-weight:800;color:#1C2B28;margin:0 0 6px;">안녕하세요. 병원이야기를 전하는 포토클리닉입니다.</p>
        <p style="font-size:14px;font-weight:700;color:#1C2B28;margin:0 0 18px;">${toName} 원장님.</p>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;">
          ${shootDate ? `${shootDate}에 진행하신 촬영 원본 데이터를 공유드립니다.` : "촬영 원본 데이터를 공유드립니다."}
        </p>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;">
          아래 링크를 통해 원본 RAW 및 JPG 파일을 다운로드하실 수 있습니다.<br>
          링크는 30일간 유효합니다.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${nasLink}" target="_blank"
            style="display:inline-block;background:#E85D2C;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;">
            원본 데이터 다운로드
          </a>
        </div>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:20px 0;">
          보정본은 별도로 공유드릴 예정입니다.<br>
          덕분에 즐거운 촬영이었습니다. 감사합니다.
        </p>
        <div style="text-align:center;margin:20px 0 28px;">
          <div style="font-size:11px;color:#9BB5B0;margin-bottom:10px;">촬영 경험이 만족스러우셨다면 후기를 남겨주세요 🙏</div>
          <a href="${reviewUrl}" target="_blank"
            style="display:inline-block;background:#155855;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;">
            리뷰 작성하기
          </a>
        </div>
        <p style="font-size:12px;color:#9BB5B0;border-top:1px solid #EEF4F3;padding-top:16px;margin:0;line-height:1.8;">
          문의사항은 언제든지 연락 주세요. 감사합니다.<br>포토클리닉 대표 정연호 드림.
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

function buildFinalDeliveryEmailHtml(params: {
  toName: string; hospitalName: string; shootDate: string | null;
  nasLink: string; fileCount?: string; packageName?: string;
}): string {
  const { toName, hospitalName, shootDate, nasLink, fileCount, packageName } = params;
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://photoclinic-diangnoisis.vercel.app";
  const reviewUrl = `${baseUrl}/review?hospital=${encodeURIComponent(hospitalName)}&name=${encodeURIComponent(toName)}`;

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
      <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,.55);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC · 포토클리닉</div>
        <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">병원의 멋진 이야기 공유드립니다</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);">${today}</div>
      </td></tr>
      <tr><td style="background:#fff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">
        <p style="font-size:15px;font-weight:800;color:#1C2B28;margin:0 0 6px;">안녕하세요. 병원이야기를 전하는 포토클리닉입니다.</p>
        <p style="font-size:14px;font-weight:700;color:#1C2B28;margin:0 0 18px;">${toName} 원장님.</p>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;">
          ${shootDate ? `${shootDate}에 진행하신 촬영 보정본 공유드립니다.` : "촬영 보정본 공유드립니다."}
        </p>
        ${(packageName || fileCount) ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#EAF4F2;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            ${packageName ? `<div style="font-size:12px;color:#5A7470;margin-bottom:4px;"><b>폴더 구성:</b> ${packageName}</div>` : ""}
            ${fileCount ? `<div style="font-size:12px;font-weight:800;color:#E85D2C;"><b>전달 수량:</b> 총 ${fileCount}컷</div>` : ""}
          </td></tr>
        </table>` : ""}
        <div style="text-align:center;margin:24px 0;">
          <a href="${nasLink}" target="_blank" style="display:inline-block;background:#E85D2C;color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;">자료 다운로드</a>
        </div>
        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:20px 0;">덕분에 즐거운 촬영이었습니다.<br>긴 시간 촬영, 끝까지 함께 잘 해주셔서 감사합니다.</p>
        <div style="text-align:center;margin:20px 0 28px;">
          <div style="font-size:11px;color:#9BB5B0;margin-bottom:10px;">촬영 경험이 만족스러우셨다면 후기를 남겨주세요 🙏</div>
          <a href="${reviewUrl}" target="_blank" style="display:inline-block;background:#155855;color:#fff;text-decoration:none;padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;">리뷰 작성하기</a>
        </div>
        <p style="font-size:12px;color:#9BB5B0;border-top:1px solid #EEF4F3;padding-top:16px;margin:0;line-height:1.8;">포토클리닉 대표 정연호 드림.</p>
      </td></tr>
      <tr><td style="background:#EAF4F2;border-radius:0 0 16px 16px;padding:16px 32px;border:1px solid #C8DDD9;border-top:none;text-align:center;">
        <div style="font-size:10px;color:#7C9893;">PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    workflow_run_id, to_step_key,
    deliveryData,
  } = body as {
    workflow_run_id: string; to_step_key: string;
    deliveryData?: { nasLink?: string; fileCount?: string; packageName?: string };
  };

  if (!workflow_run_id || !to_step_key) {
    return NextResponse.json({ ok: false, error: "workflow_run_id, to_step_key 필수" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: run, error: runErr } = await db
    .from("workflow_runs")
    .select("id, client_id, client_name, project_name, shoot_date, contact_email, contact_name")
    .eq("id", workflow_run_id)
    .single();

  if (runErr || !run) {
    return NextResponse.json({ ok: false, error: runErr?.message ?? "workflow_run not found" }, { status: 404 });
  }

  if (to_step_key === "original_delivery") {
    const nasLink = buildNasShareUrl(run.client_name, run.project_name);
    const emailHtml = buildOriginalDeliveryEmailHtml({
      toName:       run.contact_name  ?? run.client_name,
      hospitalName: run.client_name,
      shootDate:    run.shoot_date    ?? null,
      nasLink,
    });

    const [mailingInsert, logInsert, runUpdate] = await Promise.all([
      db.from("mailing_queue").insert({
        type:          "original_delivery",
        status:        "ready",
        hospital_name: run.client_name,
        contact_name:  run.contact_name  ?? run.client_name,
        to_email:      run.contact_email ?? "",
        subject:       `[포토클리닉] ${run.client_name} 원본 데이터 공유드립니다`,
        body:          emailHtml,
        source_module: "workflow",
        workflow_run_id,
        created_at:    now,
      }),
      db.from("agent_logs").insert({
        workflow_run_id,
        log_type:       "step_advanced",
        message:        `${run.client_name} 원본 데이터 전달 자동 실행 — NAS 링크 생성 및 메일 큐 등록 완료`,
        input_summary:  `workflow_run_id: ${workflow_run_id}`,
        output_summary: `nas_link: ${nasLink}`,
        success:        true,
        created_at:     now,
      }),
      db.from("workflow_runs")
        .update({ current_step_key: "original_delivery", updated_at: now })
        .eq("id", workflow_run_id),
    ]);

    const err = mailingInsert.error || logInsert.error || runUpdate.error;
    if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });

    return NextResponse.json({ ok: true, automated: true, nas_link: nasLink });
  }

  // ── 최종 전달 완료 → 보정본 배송 메일 자동 큐 ──────────────
  if (to_step_key === "review_content" && deliveryData?.nasLink) {
    const emailHtml = buildFinalDeliveryEmailHtml({
      toName:       run.contact_name  ?? run.client_name,
      hospitalName: run.client_name,
      shootDate:    run.shoot_date    ?? null,
      nasLink:      deliveryData.nasLink,
      fileCount:    deliveryData.fileCount,
      packageName:  deliveryData.packageName,
    });

    const [mailingInsert, logInsert, runUpdate] = await Promise.all([
      db.from("mailing_queue").insert({
        type:          "gallery",
        status:        "ready",
        hospital_name: run.client_name,
        contact_name:  run.contact_name  ?? run.client_name,
        to_email:      run.contact_email ?? "",
        subject:       `[포토클리닉] 병원의 멋진 이야기 공유드립니다`,
        body:          emailHtml,
        source_module: "workflow",
        workflow_run_id,
        created_at:    now,
      }),
      db.from("agent_logs").insert({
        workflow_run_id,
        log_type:       "step_advanced",
        message:        `${run.client_name} 최종 전달 완료 — 보정본 배송 메일 자동 큐 등록`,
        input_summary:  `nas_link: ${deliveryData.nasLink}`,
        output_summary: `mailing_queue: ready`,
        success:        true,
        created_at:     now,
      }),
      db.from("workflow_runs")
        .update({ current_step_key: "review_content", updated_at: now })
        .eq("id", workflow_run_id),
    ]);

    const err = mailingInsert.error || logInsert.error || runUpdate.error;
    if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });

    return NextResponse.json({ ok: true, automated: true, action: "final_delivery_queued" });
  }

  const { error: updateErr } = await db
    .from("workflow_runs")
    .update({ current_step_key: to_step_key, updated_at: now })
    .eq("id", workflow_run_id);

  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  await db.from("agent_logs").insert({
    workflow_run_id,
    log_type:       "step_advanced",
    message:        `단계 전진: → ${to_step_key}`,
    input_summary:  `workflow_run_id: ${workflow_run_id}`,
    output_summary: `new_step: ${to_step_key}`,
    success:        true,
    created_at:     now,
  });

  return NextResponse.json({ ok: true, automated: false });
}
