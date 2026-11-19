import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("이메일 발송 설정이 없습니다.");
  return {
    user,
    client: nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    }),
  };
}

function emailShell(title: string, body: string) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:28px 14px;background:#F5F8F6;font-family:Apple SD Gothic Neo,Pretendard,sans-serif;color:#1C2B28">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #D5E1DE;border-radius:16px;overflow:hidden">
      <header style="padding:22px 26px;background:#155855;color:#fff"><small style="opacity:.72">PHOTO CLINIC</small><h1 style="font-size:20px;margin:6px 0 0">${escapeHtml(title)}</h1></header>
      <main style="padding:26px;font-size:14px;line-height:1.75">${body}</main>
      <footer style="padding:15px 26px;background:#F0F5F3;color:#6F8581;font-size:11px">포토클리닉 · 제이크이미지연구소</footer>
    </div>
  </body></html>`;
}

export async function sendBillingConsentLinkEmail(input: {
  to: string;
  customerName: string;
  totalLabel: string;
  link: string;
  expiresLabel: string;
}) {
  const { user, client } = transporter();
  await client.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "포토클리닉"}" <${user}>`,
    to: input.to,
    subject: `[포토클리닉] ${input.customerName} 비용 청구 내용 확인 요청`,
    html: emailShell("비용 청구 내용 확인 요청", `
      <p><strong>${escapeHtml(input.customerName)}</strong> 담당자님, 청구 내용을 확인해 주세요.</p>
      <p style="padding:14px 16px;background:#F0F5F3;border-radius:10px"><strong>청구 금액 ${escapeHtml(input.totalLabel)}</strong><br>링크 만료 ${escapeHtml(input.expiresLabel)}</p>
      <p style="margin:24px 0"><a href="${escapeHtml(input.link)}" style="display:inline-block;background:#C94A1E;color:#fff;text-decoration:none;padding:12px 18px;border-radius:9px">청구 내용 확인하기</a></p>
      <p style="font-size:12px;color:#6F8581">링크에서 본인 확인 후 상세 내용 확인과 전자서명을 진행할 수 있습니다.</p>
    `),
  });
}

export async function sendBillingConsentOtpEmail(input: {
  to: string;
  customerName: string;
  code: string;
}) {
  const { user, client } = transporter();
  await client.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "포토클리닉"}" <${user}>`,
    to: input.to,
    subject: `[포토클리닉] 본인 확인 인증번호 ${input.code}`,
    html: emailShell("본인 확인 인증번호", `
      <p>${escapeHtml(input.customerName)} 비용 청구 동의서 확인을 위한 인증번호입니다.</p>
      <p style="font-size:30px;letter-spacing:8px;font-weight:600;text-align:center;padding:18px;background:#F0F5F3;border-radius:10px">${input.code}</p>
      <p style="font-size:12px;color:#6F8581">인증번호는 5분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>
    `),
  });
}

export async function sendBillingConsentSignedEmail(input: {
  to: string;
  customerName: string;
  documentId: string;
  pdf: Buffer;
}) {
  const { user, client } = transporter();
  await client.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "포토클리닉"}" <${user}>`,
    to: input.to,
    subject: `[포토클리닉] ${input.documentId} 서명 완료 사본`,
    html: emailShell("비용 청구 동의서 서명 완료", `
      <p><strong>${escapeHtml(input.customerName)}</strong> 비용 청구 동의서 서명이 완료되었습니다.</p>
      <p>문서 ID: <strong>${escapeHtml(input.documentId)}</strong></p>
      <p style="font-size:12px;color:#6F8581">서명 기록이 포함된 PDF 사본을 첨부합니다.</p>
    `),
    attachments: [{
      filename: `${input.documentId}.pdf`,
      content: input.pdf,
      contentType: "application/pdf",
    }],
  });
}

export async function sendBillingConsentDisputeEmail(input: {
  documentId: string;
  customerName: string;
  reason: string;
}) {
  const to = process.env.BILLING_CONSENT_ADMIN_EMAIL || process.env.GMAIL_USER;
  if (!to) throw new Error("관리자 이메일이 설정되지 않았습니다.");
  const { user, client } = transporter();
  await client.sendMail({
    from: `"${process.env.GMAIL_FROM_NAME || "포토클리닉"}" <${user}>`,
    to,
    subject: `[비용 청구 이의] ${input.customerName} · ${input.documentId}`,
    html: emailShell("비용 청구 이의가 접수되었습니다", `
      <p><strong>${escapeHtml(input.customerName)}</strong> 고객이 이의를 제출했습니다.</p>
      <p>문서 ID: ${escapeHtml(input.documentId)}</p>
      <blockquote style="margin:16px 0;padding:14px;background:#FFF3EE;border-left:3px solid #C94A1E">${escapeHtml(input.reason)}</blockquote>
    `),
  });
}
