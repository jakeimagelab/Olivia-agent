import { NextRequest, NextResponse } from "next/server";
import tls from "node:tls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encodeHeader = (v: string) =>
  /[^\x20-\x7E]/.test(v)
    ? `=?UTF-8?B?${Buffer.from(v, "utf-8").toString("base64")}?=`
    : v;

const foldBase64 = (v: string) => v.replace(/.{1,76}/g, "$&\r\n").trimEnd();

const readResponse = (socket: tls.TLSSocket) =>
  new Promise<string>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => { cleanup(); reject(new Error("SMTP 응답 시간 초과")); }, 15000);
    const cleanup = () => { clearTimeout(timer); socket.off("data", onData); socket.off("error", onError); };
    const onError = (e: Error) => { cleanup(); reject(e); };
    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf-8");
      const last = output.trimEnd().split(/\r?\n/).pop() || "";
      if (/^\d{3}\s/.test(last)) { cleanup(); resolve(output); }
    };
    socket.on("data", onData); socket.on("error", onError);
  });

const smtpCmd = async (socket: tls.TLSSocket, cmd: string, ok: number[]) => {
  socket.write(`${cmd}\r\n`);
  const res = await readResponse(socket);
  const code = Number(res.slice(0, 3));
  if (!ok.includes(code)) throw new Error(res.trim());
  return res;
};

async function sendGmail(opts: {
  user: string; password: string; fromName: string;
  to: string; subject: string; html: string;
  attachments?: { filename: string; content_type: string; content: string }[];
}) {
  const boundary = `pc-mail-${Date.now()}`;
  const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@photoclinic.local>`;

  const parts = [
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    "",
    foldBase64(Buffer.from(opts.html, "utf-8").toString("base64")),
  ];

  for (const att of opts.attachments || []) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.content_type}; name="${encodeHeader(att.filename)}"`,
      `Content-Disposition: attachment; filename="${encodeHeader(att.filename)}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      foldBase64(att.content),
    );
  }
  parts.push(`--${boundary}--`, "");

  const mime = [
    `From: ${encodeHeader(opts.fromName)} <${opts.user}>`,
    `To: <${opts.to}>`,
    `Subject: ${encodeHeader(opts.subject)}`,
    `MIME-Version: 1.0`,
    `Message-ID: ${msgId}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts,
  ].join("\r\n");

  const socket = tls.connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
  await new Promise<void>((res, rej) => { socket.once("secureConnect", res); socket.once("error", rej); });

  try {
    const greet = await readResponse(socket);
    if (!greet.startsWith("220")) throw new Error(greet.trim());
    await smtpCmd(socket, "EHLO photoclinic.local", [250]);
    await smtpCmd(socket, "AUTH LOGIN", [334]);
    await smtpCmd(socket, Buffer.from(opts.user).toString("base64"), [334]);
    await smtpCmd(socket, Buffer.from(opts.password.replace(/\s/g, "")).toString("base64"), [235]);
    await smtpCmd(socket, `MAIL FROM:<${opts.user}>`, [250]);
    await smtpCmd(socket, `RCPT TO:<${opts.to}>`, [250, 251]);
    await smtpCmd(socket, "DATA", [354]);
    await smtpCmd(socket, `${mime}\r\n.`, [250]);
    await smtpCmd(socket, "QUIT", [221]);
    return msgId;
  } finally {
    socket.end();
  }
}

function buildHtml(opts: {
  toName: string; subject: string; body: string;
  links: { label: string; url: string }[];
  attachments: { filename: string; size?: number }[];
}) {
  const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  const linksHtml = opts.links.map(l =>
    `<a href="${l.url}" target="_blank" style="display:inline-block;background:#E85D2C;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9px;font-size:13px;font-weight:800;margin:4px 0;">${l.label}</a>`
  ).join("<br>");

  const attachHtml = opts.attachments.length > 0
    ? `<div style="background:#EAF4F2;border-radius:8px;padding:12px 16px;margin-top:16px;">
        <div style="font-size:11px;font-weight:700;color:#155855;margin-bottom:8px;">📎 첨부파일 ${opts.attachments.length}개</div>
        ${opts.attachments.map(a => `<div style="font-size:11px;color:#5A7470;padding:3px 0;">${a.filename}</div>`).join("")}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<body style="margin:0;padding:0;background:#EDF5F3;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EDF5F3;padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
        <tr><td style="background:#155855;border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
          <div style="font-size:10px;color:rgba(255,255,255,.5);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">PHOTO CLINIC · 포토클리닉</div>
          <div style="font-size:22px;font-weight:800;color:#fff;">${opts.subject}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.55);margin-top:8px;">${today}</div>
        </td></tr>
        <tr><td style="background:#fff;padding:32px;border-left:1px solid #C8DDD9;border-right:1px solid #C8DDD9;">
          <p style="font-size:15px;font-weight:800;color:#1C2B28;margin:0 0 6px;">안녕하세요. 병원이야기를 전하는 포토클리닉입니다.</p>
          ${opts.toName ? `<p style="font-size:13px;font-weight:700;color:#1C2B28;margin:0 0 18px;">${opts.toName}님.</p>` : ""}
          <div style="font-size:13px;color:#5A7470;line-height:1.9;margin:0 0 20px;white-space:pre-line;">${opts.body}</div>
          ${linksHtml ? `<div style="text-align:center;margin:24px 0;">${linksHtml}</div>` : ""}
          ${attachHtml}
          <p style="font-size:11px;color:#9BB5B0;border-top:1px solid #EEF4F3;padding-top:14px;margin:20px 0 0;line-height:1.7;">
            문의사항은 언제든지 연락 주세요. 감사합니다.<br>포토클리닉 대표 정연호 드림.
          </p>
        </td></tr>
        <tr><td style="background:#EAF4F2;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;border:1px solid #C8DDD9;border-top:none;">
          <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" style="height:30px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />
          <div style="font-size:12px;font-weight:700;color:#155855;margin-bottom:5px;">사진으로 병원이야기를 전합니다, 포토클리닉</div>
          <div style="font-size:10px;color:#7C9893;line-height:1.7;">PHOTO CLINIC · 제이크이미지연구소 · 병원 전문 브랜드 촬영</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const fromName  = process.env.GMAIL_FROM_NAME || "포토클리닉";

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ ok: false, error: "GMAIL_USER 또는 GMAIL_APP_PASSWORD 미설정" }, { status: 500 });
  }

  const body = await req.json();
  const { to, toName = "", subject, body: mailBody, links = [], attachments = [] } = body;

  if (!to || !subject || !mailBody) {
    return NextResponse.json({ ok: false, error: "이메일, 제목, 본문은 필수입니다." }, { status: 400 });
  }

  try {
    const html = buildHtml({ toName, subject, body: mailBody, links, attachments });
    await sendGmail({ user: gmailUser, password: gmailPass, fromName, to, subject, html, attachments });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
