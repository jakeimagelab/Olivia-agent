import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const fromName  = process.env.GMAIL_FROM_NAME || "포토클리닉";

  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_USER 또는 GMAIL_APP_PASSWORD가 설정되지 않았습니다" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { to, toName, hospitalName, shootDate, fileCount, nasLink, message, packageName } = body;

  if (!to) return NextResponse.json({ ok: false, error: "수신 이메일 없음" }, { status: 400 });

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  const emailHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F0F7F5;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F7F5;padding:32px 16px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <!-- 헤더 -->
      <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,.55);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC</div>
        <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">촬영 파일 전송 안내</div>
        <div style="font-size:12px;color:rgba(255,255,255,.65);">${today}</div>
      </td></tr>

      <!-- 본문 -->
      <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">

        <p style="font-size:15px;font-weight:700;color:#1C2B28;margin:0 0 8px;">
          안녕하세요, ${toName || hospitalName} 담당자님 👋
        </p>
        <p style="font-size:13px;color:#5A7470;line-height:1.8;margin:0 0 24px;">
          ${message || `${hospitalName} 촬영 파일 전송을 안내드립니다.<br>아래 링크에서 파일을 다운로드해 주세요.`}
        </p>

        <!-- 전송 정보 -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#D6EDE8;border-radius:12px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <div style="font-size:11px;font-weight:700;color:#155855;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px;">전송 정보</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${hospitalName ? `<tr>
                <td style="font-size:12px;color:#9BB5B0;padding:5px 0;width:90px;">고객사명</td>
                <td style="font-size:12px;font-weight:700;color:#1C2B28;padding:5px 0;">${hospitalName}</td>
              </tr>` : ""}
              ${shootDate ? `<tr>
                <td style="font-size:12px;color:#5A7470;padding:5px 0;font-weight:500;">촬영일</td>
                <td style="font-size:12px;font-weight:700;color:#1C2B28;padding:5px 0;">${shootDate}</td>
              </tr>` : ""}
              ${packageName ? `<tr>
                <td style="font-size:12px;color:#5A7470;padding:5px 0;font-weight:500;">촬영 내용</td>
                <td style="font-size:12px;font-weight:700;color:#1C2B28;padding:5px 0;">${packageName}</td>
              </tr>` : ""}
              ${fileCount ? `<tr>
                <td style="font-size:12px;color:#5A7470;padding:5px 0;font-weight:500;">전달 수량</td>
                <td style="font-size:12px;font-weight:700;color:#E85D2C;padding:5px 0;">${fileCount}장</td>
              </tr>` : ""}
            </table>
          </td></tr>
        </table>

        <!-- 다운로드 버튼 -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
          <tr><td align="center" style="background:#F8FAFA;border:2px dashed #C8DDD9;border-radius:12px;padding:24px;">
            <div style="font-size:12px;color:#9BB5B0;margin-bottom:12px;">아래 버튼을 클릭하여 파일을 다운로드하세요</div>
            <a href="${nasLink}" target="_blank"
              style="display:inline-block;background:#E85D2C;color:#ffffff;text-decoration:none;
                     padding:13px 32px;border-radius:10px;font-size:14px;font-weight:700;">
              📁 파일 다운로드
            </a>
            <div style="font-size:10px;color:#C8DDD9;margin-top:10px;">링크가 작동하지 않으면 아래 주소를 복사해 주세요</div>
            <div style="font-size:10px;color:#9BB5B0;margin-top:4px;word-break:break-all;">${nasLink}</div>
          </td></tr>
        </table>

        <!-- 안내사항 -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F5;border-left:3px solid #E85D2C;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;font-weight:700;color:#E85D2C;margin-bottom:6px;">📌 이용 안내</div>
            <div style="font-size:11px;color:#5A7470;line-height:1.8;">
              · 링크 유효기간: 수신 후 <strong>30일</strong> 이내 다운로드 권장<br>
              · 파일 형식: JPG (고해상도, 인쇄·디지털 사용 가능)<br>
              · 문의사항은 언제든지 연락 주세요
            </div>
          </td></tr>
        </table>

        <p style="font-size:12px;color:#9BB5B0;line-height:1.8;margin:0;border-top:1px solid #EEF4F3;padding-top:18px;">
          촬영에 함께 해주셔서 감사합니다.<br>
          포토클리닉(제이크이미지연구소)은 언제나<br>
          고객의 브랜드와 함께 하겠습니다.<br><br>
          <strong style="color:#5A7470;">포토클리닉 · 정연호 드림</strong>
        </p>

      </td></tr>

      <!-- 푸터 -->
      <tr><td style="background:#EAF4F2;border-radius:0 0 16px 16px;padding:18px 32px;
                      border:1px solid #C8DDD9;border-top:none;text-align:center;">
        <div style="font-size:11px;color:#9BB5B0;line-height:1.8;">
          PHOTO CLINIC · 제이크이미지연구소<br>
          병원 전문 브랜드 촬영 · @photoclinic_kr
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  // Gmail SMTP 전송
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  await transporter.sendMail({
    from:    `"${fromName}" <${gmailUser}>`,
    to,
    subject: `[포토클리닉] ${hospitalName} 촬영 파일 전송 안내`,
    html:    emailHtml,
  });

  return NextResponse.json({ ok: true });
}
