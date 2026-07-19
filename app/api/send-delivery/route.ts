import { NextRequest, NextResponse } from "next/server";
import tls from "node:tls";
import { getErrorMessage } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveClientId } from "@/lib/clientLookup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://olivia.photoclinic.kr";
  const reviewUrl = `${baseUrl}/review?hospital=${encodeURIComponent(hospitalName || "")}&name=${encodeURIComponent(toName || "")}`;

  const emailHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F3;padding:32px 16px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <!-- 헤더 -->
      <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
        <div style="font-size:10px;color:rgba(255,255,255,.55);letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">PHOTO CLINIC · 포토클리닉</div>
        <div style="font-size:22px;font-weight:800;color:#ffffff;margin-bottom:4px;">병원의 멋진 이야기 공유드립니다</div>
        <div style="font-size:11px;color:rgba(255,255,255,.6);">${today}</div>
      </td></tr>

      <!-- 본문 -->
      <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">

        <p style="font-size:15px;font-weight:800;color:#1C2B28;margin:0 0 6px;">
          안녕하세요. 병원이야기를 전하는 포토클리닉입니다.
        </p>
        <p style="font-size:14px;font-weight:700;color:#1C2B28;margin:0 0 18px;">
          ${toName || hospitalName} 원장님.
        </p>
        <div style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;white-space:pre-line;">${message || (shootDate ? `${shootDate}에 진행하신 촬영 보정본 공유드립니다.\n아래 링크를 통해 고화질 원본 파일을 다운로드 하실 수 있습니다.\n링크는 영구적으로 보관되나, 30일 이내로 다운받으시길 권장 드립니다.` : `촬영 보정본 공유드립니다.\n아래 링크를 통해 고화질 원본 파일을 다운로드 하실 수 있습니다.\n링크는 영구적으로 보관되나, 30일 이내로 다운받으시길 권장 드립니다.`)}</div>

        ${packageName || fileCount ? `
        <!-- 납품 정보 -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#EAF4F2;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${packageName ? `<tr>
                <td style="font-size:12px;color:#5A7470;padding:4px 0;width:80px;font-weight:700;">폴더 구성</td>
                <td style="font-size:12px;font-weight:700;color:#1C2B28;padding:4px 0;">${packageName}</td>
              </tr>` : ""}
              ${fileCount ? `<tr>
                <td style="font-size:12px;color:#5A7470;padding:4px 0;font-weight:700;">전달 수량</td>
                <td style="font-size:12px;font-weight:800;color:#E85D2C;padding:4px 0;">총 ${fileCount}컷</td>
              </tr>` : ""}
            </table>
          </td></tr>
        </table>` : ""}

        <!-- 자료 다운로드 버튼 -->
        <div style="text-align:center;margin:24px 0;">
          <a href="${nasLink}" target="_blank"
            style="display:inline-block;background:#E85D2C;color:#ffffff;text-decoration:none;
                   padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;margin-bottom:8px;">
            자료 다운로드
          </a>
        </div>

        <p style="font-size:13px;color:#5A7470;line-height:1.9;margin:20px 0;">
          덕분에 즐거운 촬영이었습니다.<br>
          긴 시간 촬영, 끝까지 함께 잘 해주셔서 감사합니다.
        </p>

        <!-- 리뷰 작성하기 버튼 -->
        <div style="text-align:center;margin:20px 0 28px;">
          <div style="font-size:11px;color:#9BB5B0;margin-bottom:10px;">촬영 경험이 만족스러우셨다면 후기를 남겨주세요 🙏</div>
          <a href="${reviewUrl}" target="_blank"
            style="display:inline-block;background:#155855;color:#ffffff;text-decoration:none;
                   padding:13px 32px;border-radius:10px;font-size:14px;font-weight:800;">
            리뷰 작성하기
          </a>
        </div>

        <p style="font-size:12px;color:#9BB5B0;border-top:1px solid #EEF4F3;padding-top:16px;margin:0;line-height:1.8;">
          문의사항은 언제든지 연락 주세요. 감사합니다.<br>
          포토클리닉 대표 정연호 드림.
        </p>

      </td></tr>

      <!-- 푸터 -->
      <tr><td style="background:#EAF4F2;border-radius:0 0 16px 16px;padding:20px 32px;
                      border:1px solid #C8DDD9;border-top:none;text-align:center;">
        <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style="height:30px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
        <div style="font-size:12px;font-weight:700;color:#155855;margin-bottom:5px;">사진으로 병원이야기를 전합니다, 포토클리닉</div>
        <div style="font-size:10px;color:#7C9893;line-height:1.7;">PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const subject = `[포토클리닉] 병원의 멋진 이야기 공유드립니다`;
  const supabase = getSupabaseAdmin();
  const clientId = await resolveClientId(supabase, hospitalName);

  try {
    const id = await sendGmail({
      user: gmailUser,
      appPassword: gmailPass,
      to,
      fromName,
      subject,
      html: emailHtml,
    });

    // 이 경로는 mailing_queue를 거치지 않는 직접 발송이라 queue_id 없이 발송이력에 남긴다.
    try {
      await supabase.from("mailing_logs").insert({
        queue_id: null, type: "original_files", hospital_name: hospitalName || "", client_id: clientId,
        to_email: to, subject, status: "sent",
      });
    } catch {}

    // 원본 파일 전달 NAS 링크를 고객 레코드의 "원본사진공유링크"로도 반영한다.
    if (clientId && nasLink) {
      try {
        await supabase.from("clients").update({ original_photos_link: nasLink }).eq("id", clientId);
      } catch {}
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message = getErrorMessage(error);

    try {
      await supabase.from("mailing_logs").insert({
        queue_id: null, type: "original_files", hospital_name: hospitalName || "", client_id: clientId,
        to_email: to, subject, status: "failed", error: message,
      });
    } catch {}

    return NextResponse.json({ ok: false, error: `메일 발송 실패: ${message}` }, { status: 500 });
  }
}

type GmailPayload = {
  user: string;
  appPassword: string;
  to: string;
  fromName: string;
  subject: string;
  html: string;
};

const encodeHeader = (value: string) =>
  /[^\x20-\x7E]/.test(value)
    ? `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`
    : value;

const foldBase64 = (value: string) => value.replace(/.{1,76}/g, "$&\r\n").trimEnd();

const readResponse = (socket: tls.TLSSocket) =>
  new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Gmail SMTP 응답 시간이 초과되었습니다."));
    }, 15000);

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf-8");
      const lines = output.trimEnd().split(/\r?\n/);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(output);
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
  });

const sendGmailCommand = async (socket: tls.TLSSocket, command: string, ok: number[]) => {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!ok.includes(code)) {
    throw new Error(response.trim());
  }
  return response;
};

async function sendGmail(payload: GmailPayload) {
  const boundary = `photoclinic-${Date.now()}`;
  const messageId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@photoclinic.local>`;
  const mime = [
    `From: ${encodeHeader(payload.fromName)} <${payload.user}>`,
    `To: <${payload.to}>`,
    `Subject: ${encodeHeader(payload.subject)}`,
    `MIME-Version: 1.0`,
    `Message-ID: ${messageId}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    "",
    foldBase64(Buffer.from(payload.html, "utf-8").toString("base64")),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const socket = tls.connect({
    host: "smtp.gmail.com",
    port: 465,
    servername: "smtp.gmail.com",
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  try {
    const greeting = await readResponse(socket);
    if (!greeting.startsWith("220")) throw new Error(greeting.trim());

    await sendGmailCommand(socket, "EHLO photoclinic.local", [250]);
    await sendGmailCommand(socket, "AUTH LOGIN", [334]);
    await sendGmailCommand(socket, Buffer.from(payload.user).toString("base64"), [334]);
    await sendGmailCommand(socket, Buffer.from(payload.appPassword.replace(/\s/g, "")).toString("base64"), [235]);
    await sendGmailCommand(socket, `MAIL FROM:<${payload.user}>`, [250]);
    await sendGmailCommand(socket, `RCPT TO:<${payload.to}>`, [250, 251]);
    await sendGmailCommand(socket, "DATA", [354]);
    await sendGmailCommand(socket, `${mime}\r\n.`, [250]);
    await sendGmailCommand(socket, "QUIT", [221]);
    return messageId;
  } finally {
    socket.end();
  }
}
