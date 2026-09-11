import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { getTemporaryDocument, type TemporaryDocumentRow } from "./temporaryDocuments";

const BUCKET = "olivia-chat-attachments";

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function wrapText(value: unknown, width = 34) {
  const text = String(value ?? "").trim();
  const lines: string[] = [];
  let current = "";
  for (const token of text.split(/\s+/)) {
    if (!current) current = token;
    else if ((current + token).length <= width) current += ` ${token}`;
    else { lines.push(current); current = token; }
  }
  if (current) lines.push(current);
  return lines;
}

async function sourceLines(db: SupabaseClient, document: TemporaryDocumentRow) {
  if (document.source_table === "quotes") {
    const { data } = await db.from("quotes").select("quote_number,items,discount_amount,total_amount,contact_name").eq("id", document.source_id).maybeSingle();
    const items = Array.isArray(data?.items) ? data.items as Array<Record<string, unknown>> : [];
    return [
      data?.quote_number ? `견적번호  ${data.quote_number}` : "",
      ...items.slice(0, 8).map((item) => `${item.name || "항목"}  ·  ${Number(item.unitPrice ?? item.unit_price ?? 0).toLocaleString("ko-KR")}원 × ${Number(item.qty ?? item.quantity ?? 1)}`),
      Number(data?.discount_amount) > 0 ? `할인  -${Number(data?.discount_amount).toLocaleString("ko-KR")}원` : "",
      `최종 금액  ${Number(data?.total_amount || 0).toLocaleString("ko-KR")}원`,
    ].filter(Boolean);
  }
  if (document.source_table === "contracts") {
    const { data } = await db.from("contracts").select("quote_number,contact_name,quote_data,deposit_rate,payment_terms,delivery_terms").eq("id", document.source_id).maybeSingle();
    const quote = data?.quote_data && typeof data.quote_data === "object" ? data.quote_data as Record<string, unknown> : {};
    return [
      data?.quote_number ? `연결 견적  ${data.quote_number}` : "",
      data?.contact_name ? `담당자  ${data.contact_name}` : "",
      `계약 금액  ${Number(quote.totalAmount ?? quote.total_amount ?? 0).toLocaleString("ko-KR")}원`,
      data?.deposit_rate != null ? `계약금  ${data.deposit_rate}%` : "",
      data?.payment_terms ? `결제 조건  ${data.payment_terms}` : "",
      data?.delivery_terms ? `납품 조건  ${data.delivery_terms}` : "",
    ].filter(Boolean);
  }
  if (document.source_table === "conti_runs") {
    const [{ data: run }, { data: scenes }] = await Promise.all([
      db.from("conti_runs").select("specialty,doctor_count,status").eq("id", document.source_id).maybeSingle(),
      db.from("conti_scenes").select("name,keyword,minutes,sort").eq("run_id", document.source_id).order("sort", { ascending: true }).limit(12),
    ]);
    return [
      run?.specialty ? `진료과  ${run.specialty}` : "",
      run?.doctor_count ? `의료진  ${run.doctor_count}명` : "",
      ...((scenes ?? []) as Array<Record<string, unknown>>).map((scene, index) => `${index + 1}. ${scene.name || scene.keyword || "장면"}${scene.minutes ? `  ·  ${scene.minutes}분` : ""}`),
    ].filter(Boolean);
  }
  const { data } = await db.from("workflow_artifacts").select("document_type,title,file_name,status").eq("id", document.source_id).maybeSingle();
  return [data?.document_type ? `문서 종류  ${data.document_type}` : "", data?.file_name ? `파일  ${data.file_name}` : "", data?.status ? `상태  ${data.status}` : ""].filter(Boolean);
}

function buildSvg(document: TemporaryDocumentRow, lines: string[]) {
  const renderedLines = lines.flatMap((line) => wrapText(line)).slice(0, 17);
  const body = renderedLines.map((line, index) => `<text x="96" y="${390 + index * 48}" font-size="28" fill="#24423f">${escapeXml(line)}</text>`).join("");
  const typeLabel = ({ quote: "견적서", contract: "계약서", conti: "촬영 콘티", report: "보고서", checklist: "체크리스트", revision: "수정요청서", project_document: "프로젝트 문서" } as Record<string, string>)[document.document_type] || "문서";
  return `<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <rect width="1080" height="1350" fill="#f4f8f6"/>
    <rect x="48" y="48" width="984" height="1254" rx="42" fill="#ffffff" stroke="#dce9e5" stroke-width="3"/>
    <rect x="80" y="82" width="16" height="112" rx="8" fill="#ef5b32"/>
    <text x="126" y="130" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#ef5b32">OLIVIA · 임시문서</text>
    <text x="126" y="188" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#123f3b">${escapeXml(typeLabel)}</text>
    <text x="80" y="278" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#123f3b">${escapeXml(document.hospital_name || "고객 미지정")}</text>
    <text x="80" y="326" font-family="Arial, sans-serif" font-size="25" fill="#78918d">${escapeXml(document.title)}</text>
    <line x1="80" y1="354" x2="1000" y2="354" stroke="#dce9e5" stroke-width="2"/>
    <g font-family="Arial, sans-serif">${body}</g>
    <rect x="80" y="1190" width="920" height="72" rx="20" fill="#e9f3f0"/>
    <text x="540" y="1236" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#155855">내용 확인 후 고객등록 여부를 선택해주세요</text>
  </svg>`;
}

export async function renderTemporaryDocumentPreview(db: SupabaseClient, temporaryDocumentId: string) {
  const document = await getTemporaryDocument(db, temporaryDocumentId);
  const lines = await sourceLines(db, document);
  const buffer = await sharp(Buffer.from(buildSvg(document, lines))).png().toBuffer();
  const storagePath = `temporary-document-preview/${document.id}/${Date.now()}.png`;
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, { contentType: "image/png", cacheControl: "300", upsert: true });
  if (uploadError) throw new Error(`미리보기 업로드 실패: ${uploadError.message}`);
  const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 30);
  if (signError || !signed?.signedUrl) throw new Error("미리보기 링크를 만들지 못했습니다.");
  await db.from("temporary_documents").update({ preview_url: storagePath, updated_at: new Date().toISOString() }).eq("id", document.id);
  return { document, url: signed.signedUrl, storagePath };
}
