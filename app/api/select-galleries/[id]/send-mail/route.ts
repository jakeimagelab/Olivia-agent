import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const sb = getSupabaseAdmin();
    const { to_email, to_name } = await req.json();

    const { data: gallery } = await sb
      .from("select_galleries")
      .select("*")
      .eq("id", id)
      .single();
    if (!gallery) return NextResponse.json({ ok: false, error: "갤러리 없음" }, { status: 404 });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://olivia.photoclinic.kr";
    const selectUrl = `${baseUrl}/select/${gallery.share_token}`;

    const expiresDate = new Date(gallery.file_expires_at).toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });

    const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; background:#f5f5f5; margin:0; padding:0; }
  .wrap { max-width:600px; margin:0 auto; background:#fff; }
  .header { background:#155855; padding:32px 40px; text-align:center; }
  .header h1 { color:#fff; font-size:20px; margin:0; letter-spacing:-0.5px; }
  .body { padding:40px; }
  .body p { font-size:15px; line-height:1.8; color:#333; margin:0 0 16px; }
  .cta { display:block; margin:32px auto; background:#155855; color:#fff !important; text-decoration:none;
         font-size:16px; font-weight:700; padding:16px 40px; border-radius:8px; text-align:center; max-width:320px; }
  .method-box { background:#f0f9f8; border-radius:8px; padding:20px 24px; margin:24px 0; }
  .method-box h3 { color:#155855; font-size:14px; margin:0 0 8px; }
  .method-box p { font-size:13px; color:#555; margin:0; line-height:1.7; }
  .warning { background:#fff8e1; border-left:4px solid #f9a825; padding:14px 18px; border-radius:0 8px 8px 0; margin:24px 0; font-size:13px; color:#555; line-height:1.7; }
  .footer { background:#f5f5f5; padding:24px 40px; font-size:12px; color:#888; text-align:center; line-height:1.8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>포토클리닉</h1></div>
  <div class="body">
    <p>안녕하세요${to_name ? `, ${to_name}님` : ""}.</p>
    <p>포토클리닉 정연호입니다.</p>
    <p><strong>${gallery.shooting_name ?? gallery.title}</strong> 촬영 원본 확인 및 보정 사진 선택 링크를 전달드립니다.</p>
    <p>아래 버튼을 눌러 원본을 확인하시고, 보정 원하시는 사진을 선택해주세요.</p>
    <a class="cta" href="${selectUrl}">원본 확인 및 보정 사진 선택하기</a>
    <p>선택 방법은 두 가지입니다.</p>
    <div class="method-box">
      <h3>방법 1. 웹에서 바로 선택하기</h3>
      <p>사진을 웹에서 크게 보고 체크하실 수 있습니다.<br>파일을 다시 보내실 필요가 없습니다.</p>
    </div>
    <div class="method-box">
      <h3>방법 2. 다운로드 후 선택 파일 업로드하기</h3>
      <p>전체 JPG를 다운로드한 뒤 컴퓨터에서 직접 확인하실 수 있습니다.<br>보정할 JPG 파일만 다시 해당 페이지에 업로드해주세요.</p>
    </div>
    <div class="warning">
      ⚠️ 카카오톡으로 사진을 그냥 보내시면 파일명·화질·데이터가 변경될 수 있습니다.<br>
      RAW 원본 매칭을 위해 <strong>파일명은 절대 변경하지 말아주세요.</strong><br>
      사진 파일은 보안을 위해 <strong>${expiresDate}까지만</strong> 보관됩니다.
    </div>
    <p>선택 완료 후에는 선택 파일명 정보만 고객관리 시스템에 저장됩니다.</p>
    <p>감사합니다.<br><strong>포토클리닉 대표 정연호 드림</strong></p>
  </div>
  <div class="footer">
    이 메일은 포토클리닉에서 발송된 자동 메일입니다.<br>
    문의: photoclinic@photoclinic.co.kr
  </div>
</div>
</body>
</html>`;

    // mailing_queue에 초안 저장 (직접 발송 대신 승인 후 발송)
    const { data: mailItem, error: mailErr } = await sb
      .from("mailing_queue")
      .insert({
        type: "select_gallery",
        source_module: "select-galleries",
        source_id: gallery.id,
        hospital_name: gallery.hospital_name ?? gallery.title ?? "",
        contact_name: to_name ?? "",
        to_email: to_email ?? "",
        subject: "[포토클리닉] 촬영 원본 확인 및 보정 사진 선택 안내드립니다",
        body: html,
        attachments: [],
        links: [{ label: "셀렉 갤러리", url: selectUrl }],
        status: to_email ? "ready" : "draft",
      })
      .select("id")
      .single();

    if (mailErr) throw new Error(mailErr.message);

    // 갤러리 상태 → mail_draft_created
    const now = new Date().toISOString();
    await sb
      .from("select_galleries")
      .update({ status: "mail_draft_created", updated_at: now })
      .eq("id", id);

    return NextResponse.json({
      ok: true,
      mail_queue_id: mailItem?.id,
      selectUrl,
      message: "브랜드메일 초안이 메일링 큐에 저장되었습니다. 메일 관리에서 검토 후 발송하세요.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
