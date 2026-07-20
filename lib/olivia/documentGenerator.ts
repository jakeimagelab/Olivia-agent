import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { getSupabaseAdmin } from "@/lib/supabase";

const BUCKET = "workflow-artifacts";
const PAGE_MARGIN = 20;
const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FONT_NAME = "NanumSquare";

function safeFileName(value: string) {
  return value.normalize("NFC").replace(/[\\/:*?"<>| -]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
}

let cachedFontBase64: string | null = null;
function loadKoreanFontBase64() {
  if (cachedFontBase64) return cachedFontBase64;
  const fontPath = path.join(process.cwd(), "lib/olivia/fonts/NanumSquare-Regular.ttf");
  cachedFontBase64 = readFileSync(fontPath).toString("base64");
  return cachedFontBase64;
}

function registerKoreanFont(pdf: jsPDF) {
  const base64 = loadKoreanFontBase64();
  pdf.addFileToVFS("NanumSquare-Regular.ttf", base64);
  pdf.addFont("NanumSquare-Regular.ttf", FONT_NAME, "normal");
  pdf.addFont("NanumSquare-Regular.ttf", FONT_NAME, "bold");
}

/**
 * 클로드가 채팅에서 자유 형식으로 생성한 텍스트 콘텐츠를 PDF로 변환한다.
 * 기존 견적서/계약서 PDF(app/contract 등)는 html2canvas로 브라우저 DOM을 캡처하는 방식이라
 * 서버(API 라우트)에서는 쓸 수 없다 — 여기서는 jsPDF의 텍스트/벡터 API만으로 직접 그린다.
 * 기본 helvetica 폰트는 한글 글리프가 없어 나눔스퀘어 폰트를 임베드해서 사용한다(굵기 구분은
 * 폰트 파일 하나만 있어 시각적으로는 없지만, 정상적으로 한글이 렌더링되는 게 우선이다).
 * content 파싱 규칙: "## "로 시작하면 소제목, "- "로 시작하면 불릿, 빈 줄은 문단 구분.
 */
export async function generateFreeformPdf(input: { title: string; content: string; fileName?: string }) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  registerKoreanFont(pdf);
  let y = PAGE_MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_HEIGHT - PAGE_MARGIN) {
      pdf.addPage();
      y = PAGE_MARGIN;
    }
  };

  pdf.setFont(FONT_NAME, "bold");
  pdf.setFontSize(18);
  const titleLines = pdf.splitTextToSize(input.title || "문서", CONTENT_WIDTH);
  ensureSpace(titleLines.length * 8 + 4);
  pdf.text(titleLines, PAGE_MARGIN, y);
  y += titleLines.length * 8 + 2;

  pdf.setDrawColor(21, 88, 85);
  pdf.setLineWidth(0.5);
  pdf.line(PAGE_MARGIN, y, PAGE_WIDTH - PAGE_MARGIN, y);
  y += 8;

  pdf.setFont(FONT_NAME, "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(120, 120, 120);
  pdf.text(new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }), PAGE_MARGIN, y);
  y += 10;
  pdf.setTextColor(20, 20, 20);

  const lines = (input.content || "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 4;
      continue;
    }
    if (line.startsWith("## ")) {
      pdf.setFont(FONT_NAME, "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(21, 88, 85);
      const wrapped = pdf.splitTextToSize(line.slice(3), CONTENT_WIDTH);
      ensureSpace(wrapped.length * 6.5 + 4);
      pdf.text(wrapped, PAGE_MARGIN, y);
      y += wrapped.length * 6.5 + 3;
      pdf.setTextColor(20, 20, 20);
      continue;
    }
    if (line.startsWith("- ")) {
      pdf.setFont(FONT_NAME, "normal");
      pdf.setFontSize(11);
      const wrapped = pdf.splitTextToSize(line.slice(2), CONTENT_WIDTH - 6);
      ensureSpace(wrapped.length * 5.5 + 2);
      pdf.text("•", PAGE_MARGIN, y);
      pdf.text(wrapped, PAGE_MARGIN + 5, y);
      y += wrapped.length * 5.5 + 2;
      continue;
    }
    pdf.setFont(FONT_NAME, "normal");
    pdf.setFontSize(11);
    const wrapped = pdf.splitTextToSize(line, CONTENT_WIDTH);
    ensureSpace(wrapped.length * 5.5 + 2);
    pdf.text(wrapped, PAGE_MARGIN, y);
    y += wrapped.length * 5.5 + 2;
  }

  const buffer = Buffer.from(pdf.output("arraybuffer"));
  const fileName = safeFileName(input.fileName || input.title || "document") + ".pdf";
  const storageFileName = toAsciiStorageSegment(fileName, "document.pdf");
  const storagePath = `chat-generated/${new Date().toISOString().slice(0, 10)}/${randomUUID()}/${storageFileName}`;

  const db = getSupabaseAdmin();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 30, { download: fileName });
  if (signError || !signed?.signedUrl) throw new Error(signError?.message || "다운로드 링크를 만들지 못했습니다.");

  return { url: signed.signedUrl, fileName };
}
