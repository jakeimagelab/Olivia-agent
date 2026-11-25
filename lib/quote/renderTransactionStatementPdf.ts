import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderA4HtmlPdf } from "@/lib/contract/renderContractPdf";
import { buildStatementHtml } from "./transactionStatementHtml";
import { TransactionStatementError, STATEMENT_BUCKET, type TransactionStatement } from "./transactionStatementStore";
import { getSupabaseAdmin } from "@/lib/supabase";

const png = (buffer: Buffer) => `data:image/png;base64,${buffer.toString("base64")}`;

export async function readTransactionStatementSeal() {
  try {
    return await readFile(path.join(process.cwd(), "public/assets/jake-seal.png"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function renderTransactionStatementPdf(statement: TransactionStatement, requireSeal = false) {
  const seal = await readTransactionStatementSeal();
  if (requireSeal && !seal) {
    throw new TransactionStatementError("공급자 직인 파일을 등록한 후 발송할 수 있습니다.", 422);
  }
  const [logo, signature, font] = await Promise.all([
    statement.snapshot.document.brand === "jakeimage"
      ? readFile(path.join(process.cwd(), "public/assets/jakeimage-logo.png"))
      : readFile(path.join(process.cwd(), "public/assets/photoclinic-logo.png")),
    readFile(path.join(process.cwd(), "public/assets/ceo-signature.png")),
    readFile(path.join(process.cwd(), "lib/olivia/fonts/NanumSquare-Regular.ttf")),
  ]);
  return renderA4HtmlPdf(buildStatementHtml(statement, {
    logo: png(logo),
    signature: png(signature),
    seal: seal ? png(seal) : undefined,
    koreanFont: `data:font/ttf;base64,${font.toString("base64")}`,
  }), { fitSelector: ".statement-sheet" });
}

export async function statementPdfResponse(statement: TransactionStatement) {
  let buffer: Uint8Array<ArrayBuffer>;
  if (statement.status === "sent" && statement.pdf_path) {
    const { data, error } = await getSupabaseAdmin().storage.from(STATEMENT_BUCKET).download(statement.pdf_path);
    if (error || !data) throw new TransactionStatementError("발송한 거래명세서 PDF를 읽지 못했습니다.", 500);
    buffer = new Uint8Array(await data.arrayBuffer());
  } else {
    buffer = new Uint8Array(await renderTransactionStatementPdf(statement, statement.status !== "draft"));
  }
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${statement.statement_number}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
