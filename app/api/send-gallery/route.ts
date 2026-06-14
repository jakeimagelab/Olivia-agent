import { NextRequest, NextResponse } from "next/server";
import { sendGmail } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const fromName = process.env.GMAIL_FROM_NAME || "포토클리닉";

  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_USER 또는 GMAIL_APP_PASSWORD가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { to, toName, hospitalName, nasLink, shootDate, description, thumbnailUrl } = await req.json();
  if (!to || !hospitalName || !nasLink) {
    return NextResponse.json({ ok: false, error: "수신 이메일, 병원명, NAS 링크는 필수입니다." }, { status: 400 });
  }

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const html = `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:0;background:#edf5f3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf5f3;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#155855;border-radius:18px 18px 0 0;padding:30px 34px;text-align:center;">
          <div style="font-size:11px;color:rgba(255,255,255,.58);letter-spacing:2px;text-transform:uppercase;">PHOTO CLINIC GALLERY</div>
          <div style="font-size:24px;font-weight:800;color:#fff;margin-top:8px;">촬영 갤러리 공유</div>
          <div style="font-size:12px;color:rgba(255,255,255,.68);margin-top:6px;">${today}</div>
        </td></tr>
        <tr><td style="background:#fff;padding:34px;border-left:1px solid #c8ddd9;border-right:1px solid #c8ddd9;">
          <p style="font-size:16px;font-weight:800;color:#1c2b28;margin:0 0 10px;">
            안녕하세요, ${toName || hospitalName} 담당자님.
          </p>
          <p style="font-size:13px;color:#5a7470;line-height:1.8;margin:0 0 24px;">
            ${hospitalName} 촬영 갤러리를 공유드립니다. 아래 버튼에서 NAS 갤러리를 확인하실 수 있습니다.
          </p>
          ${thumbnailUrl ? `<img src="${thumbnailUrl}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:14px;margin-bottom:22px;" />` : ""}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#eaf4f2;border-radius:14px;margin-bottom:24px;">
            <tr><td style="padding:20px 22px;">
              <div style="font-size:12px;color:#155855;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px;">Gallery Info</div>
              <div style="font-size:13px;color:#1c2b28;line-height:1.8;">
                <strong>병원명</strong> · ${hospitalName}<br>
                ${shootDate ? `<strong>촬영일</strong> · ${shootDate}<br>` : ""}
                ${description ? `<strong>내용</strong> · ${description}` : ""}
              </div>
            </td></tr>
          </table>
          <div style="text-align:center;background:#f8fafa;border:2px dashed #c8ddd9;border-radius:14px;padding:26px;">
            <a href="${nasLink}" target="_blank"
              style="display:inline-block;background:#e85d2c;color:#fff;text-decoration:none;padding:14px 34px;border-radius:10px;font-size:14px;font-weight:800;">
              갤러리 확인하기
            </a>
            <div style="font-size:10px;color:#9bb5b0;margin-top:12px;word-break:break-all;">${nasLink}</div>
          </div>
        </td></tr>
        <tr><td style="background:#eaf4f2;border-radius:0 0 18px 18px;padding:18px 34px;text-align:center;border:1px solid #c8ddd9;border-top:none;">
          <div style="font-size:11px;color:#7c9893;line-height:1.7;">PHOTO CLINIC · 제이크이미지연구소<br>병원 전문 브랜드 촬영</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const id = await sendGmail({
      user: gmailUser,
      appPassword: gmailPass,
      to,
      fromName,
      subject: `[포토클리닉] ${hospitalName} 촬영 갤러리 공유`,
      html
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
