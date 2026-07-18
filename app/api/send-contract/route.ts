import { NextRequest, NextResponse } from "next/server";
import tls from "node:tls";
import { getErrorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailAppPassword) {
    return NextResponse.json(
      { ok: false, error: "GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정" },
      { status: 500 }
    );
  }

  const body = await req.json();
  const { to, toName, hospitalName, contractHtml, contractPdfBase64, fileName, message } = body;
  if (!to) return NextResponse.json({ ok: false, error: "수신 이메일 없음" }, { status: 400 });
  if (!contractPdfBase64 && !contractHtml) {
    return NextResponse.json({ ok: false, error: "계약서 파일 없음" }, { status: 400 });
  }

  const greetingName = toName || hospitalName || "고객";

  const emailHtml = `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Apple SD Gothic Neo',sans-serif;background:#F0F7F5;padding:32px 16px;margin:0;">
  <div style="max-width:520px;margin:0 auto;">
    <div style="background:#155855;border-radius:14px 14px 0 0;padding:24px 28px;text-align:center;">
      <div style="font-size:10px;color:rgba(255,255,255,.6);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:5px;">PHOTO CLINIC</div>
      <div style="font-size:20px;font-weight:700;color:#fff;">촬영 계약서 안내</div>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #C8DDD9;border-top:none;">
      <p style="font-size:15px;font-weight:700;color:#1C2B28;margin-bottom:7px;">
        안녕하세요, ${greetingName}
      </p>
      <p style="font-size:13px;color:#5A7470;line-height:1.8;margin-bottom:18px;">
        ${message || "포토클리닉 촬영 계약서를 발송드립니다.<br>내용 확인 후 서명하여 회신 부탁드립니다."}
      </p>
      <div style="background:#EAF4F2;border-left:4px solid #155855;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:18px;">
        <div style="font-size:11px;font-weight:700;color:#155855;margin-bottom:5px;">📋 계약서 확인 방법</div>
        <div style="font-size:11px;color:#5A7470;line-height:1.8;">
          1. 첨부된 계약서 PDF를 확인해주세요<br>
          2. 내용 검토 후 서명란에 서명·날인하여 회신해 주세요<br>
          3. 계약금 입금 확인 후 촬영 일정이 확정됩니다
        </div>
      </div>
      <p style="font-size:11px;color:#9BB5B0;line-height:1.8;border-top:1px solid #EEF4F3;padding-top:14px;">
        문의사항은 언제든지 연락 주세요.<br>감사합니다. 포토클리닉 드림
      </p>
    </div>
    <div style="background:#EAF4F2;border-radius:0 0 14px 14px;padding:14px 28px;text-align:center;
                border:1px solid #C8DDD9;border-top:none;">
      <div style="font-size:10px;color:#9BB5B0;">PHOTO CLINIC · 제이크이미지연구소 · @photoclinic_kr</div>
    </div>
  </div>
</body>
</html>`;

  const attachment = {
    filename: contractPdfBase64
      ? fileName || `포토클리닉_계약서_${hospitalName}.pdf`
      : `포토클리닉_계약서_${hospitalName}.html`,
    contentType: contractPdfBase64 ? "application/pdf" : "text/html; charset=UTF-8",
    content: contractPdfBase64 || Buffer.from(contractHtml, "utf-8").toString("base64"),
  };

  try {
    const smtpId = await sendGmail({
      user: gmailUser,
      appPassword: gmailAppPassword,
      to,
      fromName: process.env.GMAIL_FROM_NAME || "포토클리닉",
      subject: `[포토클리닉] ${hospitalName} 촬영 계약서`,
      html: emailHtml,
      attachment,
    });

    return NextResponse.json({ ok: true, id: smtpId });
  } catch (error) {
    const message = getErrorMessage(error);
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
  attachment: {
    filename: string;
    contentType: string;
    content: string;
  };
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
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    "",
    foldBase64(Buffer.from(payload.html, "utf-8").toString("base64")),
    "",
    `--${boundary}`,
    `Content-Type: ${payload.attachment.contentType}; name="${encodeHeader(payload.attachment.filename)}"`,
    `Content-Disposition: attachment; filename="${encodeHeader(payload.attachment.filename)}"`,
    `Content-Transfer-Encoding: base64`,
    "",
    foldBase64(payload.attachment.content),
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
