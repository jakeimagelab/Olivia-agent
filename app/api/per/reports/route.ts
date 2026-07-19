import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { savePerMailingQueue, formatPoints, formatKRW, TIER_LABEL } from "@/lib/per";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  let query = db.from("per_reports").select("*").order("created_at", { ascending: false });
  if (type) query = query.eq("report_type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, reports: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = getSupabaseAdmin();
  const { type, clientId, campaignId } = await req.json();

  if (type === "client" && clientId) {
    const [clientRes, txRes, orderRes, donRes] = await Promise.all([
      db.from("clients").select("*").eq("id", clientId).single(),
      db.from("reward_transactions").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
      db.from("reward_orders").select("*, reward_products(name)").eq("client_id", clientId).order("created_at", { ascending: false }),
      db.from("donation_records").select("*, donation_campaigns(title)").eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);

    const client = clientRes.data;
    if (!client) return NextResponse.json({ ok: false, error: "병원을 찾을 수 없습니다." }, { status: 404 });

    const reportData = {
      client,
      transactions: txRes.data ?? [],
      orders:       orderRes.data ?? [],
      donations:    donRes.data ?? [],
    };

    const html = buildClientReportHtml(client, reportData);
    const title = `${client.hospital_name} PER 리워드 리포트`;

    const mailingId = await savePerMailingQueue({
      type: "per_report",
      hospitalName: client.hospital_name,
      clientId: clientId,
      contactName:  client.contact_name ?? "",
      toEmail:      client.email ?? "",
      subject:      `[PER 리포트] ${client.hospital_name} 리워드 활동 내역`,
      body:         `안녕하세요 ${client.hospital_name}님,\n\nPER 리워드 리포트가 생성되었습니다. 자세한 내용은 첨부된 리포트를 확인해주세요.\n\n좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.\n포토클리닉 드림`,
    });

    const { data: report, error } = await db.from("per_reports").insert({
      client_id: clientId, report_type: "client", title,
      summary: `누적 ${formatPoints(client.total_earned_points ?? 0)} 적립, 사용 가능 ${formatPoints(client.available_points ?? 0)}`,
      report_data: reportData, html_content: html, mailing_queue_id: mailingId,
    }).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: report.id, html, mailingId, message: "PER 리포트가 생성되었고, 올리비아 메일링함에 자동 저장되었습니다." });
  }

  if (type === "campaign" && campaignId) {
    const [campRes, recordsRes] = await Promise.all([
      db.from("donation_campaigns").select("*").eq("id", campaignId).single(),
      db.from("donation_records").select("*, clients(hospital_name)").eq("campaign_id", campaignId).eq("status", "confirmed"),
    ]);

    const camp = campRes.data;
    if (!camp) return NextResponse.json({ ok: false, error: "캠페인을 찾을 수 없습니다." }, { status: 404 });

    const records = recordsRes.data ?? [];
    const html = buildCampaignReportHtml(camp, records);
    const title = `${camp.title} 기부 리포트`;

    const mailingId = await savePerMailingQueue({
      type: "per_report",
      hospitalName: "포토클리닉 파트너 병원",
      subject: `[PER 기부 리포트] ${camp.title}`,
      body: `${camp.period_label} 공동 기부 리포트가 생성되었습니다.\n총 기부 포인트: ${camp.current_points?.toLocaleString()}P\n참여 병원: ${records.length}곳\n\n좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.\n포토클리닉 드림`,
    });

    const { data: report, error } = await db.from("per_reports").insert({
      campaign_id: campaignId, report_type: "campaign", title,
      summary: `${records.length}개 병원 참여, 총 ${formatPoints(camp.current_points ?? 0)} 기부`,
      report_data: { camp, records }, html_content: html, mailing_queue_id: mailingId,
    }).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: report.id, html, mailingId, message: "기부 리포트가 생성되었고, 올리비아 메일링함에 자동 저장되었습니다." });
  }

  return NextResponse.json({ ok: false, error: "type(client|campaign) 및 관련 ID 필수" }, { status: 400 });
}

function buildClientReportHtml(client: any, data: any): string {
  const tier = TIER_LABEL[client.reward_tier ?? "standard"] ?? "일반";
  const orders = (data.orders ?? []).map((o: any) =>
    `<li>${o.reward_products?.name ?? "제품"} × ${o.quantity} (${o.used_points?.toLocaleString()}P)</li>`
  ).join("");
  const donations = (data.donations ?? []).map((d: any) =>
    `<li>${d.donation_campaigns?.title ?? "기부"} — ${d.points?.toLocaleString()}P</li>`
  ).join("");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Apple SD Gothic Neo,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#1C2B28;background:#fff;}
  .header{background:#155855;color:#fff;border-radius:12px;padding:28px 32px;margin-bottom:24px;}
  .header h1{margin:0;font-size:22px;} .header p{margin:6px 0 0;opacity:.8;font-size:13px;}
  .badge{display:inline-block;background:#E85D2C;color:#fff;border-radius:20px;padding:3px 14px;font-size:12px;font-weight:700;margin-top:8px;}
  .card{background:#F0F9F8;border-radius:10px;padding:20px 24px;margin-bottom:16px;}
  .card h3{margin:0 0 12px;font-size:14px;color:#155855;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .stat{background:#fff;border-radius:8px;padding:14px 16px;text-align:center;}
  .stat .n{font-size:22px;font-weight:800;color:#155855;} .stat .l{font-size:11px;color:#5A7470;margin-top:2px;}
  ul{margin:0;padding-left:18px;} li{font-size:13px;line-height:1.8;}
  .slogan{text-align:center;color:#9BB5B0;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #EAF4F2;}
</style></head><body>
<div class="header">
  <h1>PER 리워드 리포트</h1>
  <p>${client.hospital_name} · ${client.contact_name ?? ""}</p>
  <span class="badge">${tier} 등급</span>
</div>
<div class="card">
  <h3>포인트 요약</h3>
  <div class="grid">
    <div class="stat"><div class="n">${(client.total_earned_points ?? 0).toLocaleString()}P</div><div class="l">누적 적립</div></div>
    <div class="stat"><div class="n">${(client.available_points ?? 0).toLocaleString()}P</div><div class="l">사용 가능</div></div>
    <div class="stat"><div class="n">${(client.total_used_points ?? 0).toLocaleString()}P</div><div class="l">사용 완료</div></div>
    <div class="stat"><div class="n">${(client.total_donated_points ?? 0).toLocaleString()}P</div><div class="l">기부 참여</div></div>
  </div>
</div>
${orders ? `<div class="card"><h3>신청한 제품</h3><ul>${orders}</ul></div>` : ""}
${donations ? `<div class="card"><h3>기부 참여 내역</h3><ul>${donations}</ul></div>` : ""}
<div class="card"><h3>누적 촬영 금액</h3><p style="font-size:20px;font-weight:800;color:#E85D2C;margin:0">${(client.total_paid_amount ?? 0).toLocaleString()}원</p></div>
<div class="slogan">좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.<br/>포토클리닉 드림 · PER Photoclinic ESG Reward</div>
</body></html>`;
}

function buildCampaignReportHtml(camp: any, records: any[]): string {
  const publicList = records.filter(r => r.hospital_name_public).map(r =>
    `<li>${r.display_name ?? r.clients?.name ?? "익명"} — ${r.points?.toLocaleString()}P</li>`
  ).join("");

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/>
<style>
  body{font-family:Apple SD Gothic Neo,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#1C2B28;background:#fff;}
  .header{background:linear-gradient(135deg,#155855,#22876A);color:#fff;border-radius:12px;padding:32px;text-align:center;margin-bottom:24px;}
  .header h1{margin:0;font-size:24px;} .header p{margin:8px 0 0;opacity:.85;font-size:13px;}
  .big{font-size:36px;font-weight:800;margin:16px 0 4px;}
  .card{background:#F0F9F8;border-radius:10px;padding:20px 24px;margin-bottom:16px;}
  .card h3{margin:0 0 12px;font-size:14px;color:#155855;}
  .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;}
  .stat{background:#fff;border-radius:8px;padding:14px;text-align:center;}
  .stat .n{font-size:20px;font-weight:800;color:#155855;} .stat .l{font-size:11px;color:#5A7470;}
  ul{margin:0;padding-left:18px;} li{font-size:13px;line-height:1.9;}
  .slogan{text-align:center;color:#9BB5B0;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #EAF4F2;}
</style></head><body>
<div class="header">
  <h1>${camp.title}</h1>
  <p>${camp.period_label ?? ""} · ${camp.donation_target ?? ""}</p>
  <div class="big">${(camp.current_points ?? 0).toLocaleString()}P</div>
  <p>총 기부 포인트</p>
</div>
<div class="card">
  <h3>캠페인 현황</h3>
  <div class="grid">
    <div class="stat"><div class="n">${records.length}</div><div class="l">참여 병원</div></div>
    <div class="stat"><div class="n">${(camp.current_amount ?? 0).toLocaleString()}원</div><div class="l">기부 금액</div></div>
    <div class="stat"><div class="n">${camp.donation_target ?? "—"}</div><div class="l">기부처</div></div>
  </div>
</div>
${publicList ? `<div class="card"><h3>참여 병원 명단</h3><p style="font-size:12px;color:#9BB5B0;margin:0 0 8px">병원명 공개에 동의한 병원만 표시됩니다.</p><ul>${publicList}</ul></div>` : ""}
<div class="slogan">좋은 병원 이미지를 만드는 촬영이, 좋은 공간과 좋은 나눔으로 이어지도록.<br/>${camp.period_label ?? ""} 포토클리닉 파트너 병원 일동 · PER Photoclinic ESG Reward</div>
</body></html>`;
}
