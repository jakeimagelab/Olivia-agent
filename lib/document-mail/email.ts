import { CONTRACT_BRAND_CONFIG, type ContractBrand } from "@/lib/contract/contractDocument";
import { DOCUMENT_BRAND_COLORS, DOCUMENT_SUPPLIER } from "@/lib/contract/documentBrandStyle";
import { DOCUMENT_MAIL_EXPIRY_DAYS, DOCUMENT_MAIL_LABELS, type DeliveredDocument } from "./shared";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function defaultDocumentMailMessage(brand: ContractBrand, contactName: string) {
  const name = contactName.trim().replace(/\s+/g, " ");
  const director = name.match(/^(.*?)\s*(대표\s*원장|원장)\s*님?$/u);
  const recipient = director ? `${director[1].trim()} ${director[2].replace(/\s+/g, "")}님`.trim()
    : name && (name.endsWith("님") ? name : `${name}${brand === "photoclinic" ? " 원장님" : "님"}`);
  const sender = DOCUMENT_SUPPLIER.representative;
  return [
    recipient ? `안녕하세요. ${recipient}` : "안녕하세요.",
    `${CONTRACT_BRAND_CONFIG[brand].label} ${sender}입니다.`,
    "견적 및 계약 관련 서류를 보내드립니다.",
    "아래 링크에서 확인 및 다운로드 가능합니다.",
    "감사합니다.",
    `${sender} 드림.`,
  ].join("\n");
}

export function documentMailBody({
  brand, message, documents, portalUrl, requiresSignature,
}: {
  brand: ContractBrand;
  message: string;
  documents: DeliveredDocument[];
  portalUrl: URL;
  requiresSignature: boolean;
}) {
  const config = CONTRACT_BRAND_CONFIG[brand];
  const { ink, accent } = DOCUMENT_BRAND_COLORS[brand];
  const buttonColor = brand === "photoclinic" ? "#C94A1E" : accent;
  const names = documents.map(({ kind, number }) => `${DOCUMENT_MAIL_LABELS[kind]}${number ? ` · ${number}` : ""}`);
  const signatureNote = "계약서는 문서함에서 전자서명해 주세요.";
  const expiryNote = `링크 이용 기간은 ${DOCUMENT_MAIL_EXPIRY_DAYS}일입니다.`;
  const logo = new URL(config.logo, portalUrl.origin);
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F1F5EE;font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1C2B28">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F1F5EE"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:560px;border:1px solid #D5E1DE;border-top:4px solid ${ink};border-radius:12px">
<tr><td style="padding:20px 22px 16px;border-bottom:1px solid #D5E1DE"><img src="${escapeHtml(logo.href)}" width="104" alt="${config.label}" style="display:block;max-width:104px;height:auto;border:0"></td></tr>
<tr><td style="padding:23px 22px 24px;font-size:15px;line-height:1.7;color:#1C2B28">
<h1 style="margin:0 0 16px;font-size:19px;font-weight:600;color:${ink}">문서 안내</h1>
<p style="margin:0 0 18px;overflow-wrap:anywhere">${escapeHtml(message).replace(/\r?\n/g, "<br>")}</p>
<div style="padding:11px 14px;background:#F1F5EE;border-left:3px solid ${ink};color:${ink};font-size:13px">${names.map(escapeHtml).join("<br>")}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td bgcolor="${buttonColor}" style="border-radius:8px">
<a href="${escapeHtml(portalUrl.href)}" style="display:inline-block;padding:12px 20px;color:#FFFFFF;font-size:15px;font-weight:600;line-height:1.35;text-decoration:none">문서 확인하기</a>
</td></tr></table>
${requiresSignature ? `<p style="margin:13px 0 0;font-size:13px;color:#5A7470">${signatureNote}</p>` : ""}
<p style="margin:7px 0 0;font-size:12px;color:#5A7470">${expiryNote}</p>
</td></tr></table></td></tr></table></body></html>`;

  return {
    html,
    text: `${message}\n\n${names.map((name) => `- ${name}`).join("\n")}\n\n${requiresSignature ? `${signatureNote}\n` : ""}문서 확인하기\n${portalUrl.href}\n\n${expiryNote}`,
  };
}
