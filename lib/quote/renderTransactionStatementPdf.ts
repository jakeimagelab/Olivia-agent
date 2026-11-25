import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderA4HtmlPdf } from "@/lib/contract/renderContractPdf";
import { buildStatementHtml } from "./transactionStatementHtml";
import { matchesStatementSupplier, resolveStatementBusinessDetails } from "./transactionStatementDetails";
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

export async function renderTransactionStatementPdf(statement: TransactionStatement, requireSeal = false, recipientSignature?: string) {
  const { supplier } = resolveStatementBusinessDetails(statement.snapshot, statement.business_details);
  const registeredSupplier = matchesStatementSupplier(supplier);
  const seal = registeredSupplier ? await readTransactionStatementSeal() : null;
  if (requireSeal && registeredSupplier && !seal) {
    throw new TransactionStatementError("공급자 직인 파일을 등록한 후 발송할 수 있습니다.", 422);
  }
  const [logo, signature, font] = await Promise.all([
    statement.snapshot.document.brand === "jakeimage"
      ? readFile(path.join(process.cwd(), "public/assets/jakeimage-logo.png"))
      : readFile(path.join(process.cwd(), "public/assets/photoclinic-logo.png")),
    registeredSupplier ? readFile(path.join(process.cwd(), "public/assets/ceo-signature.png")) : null,
    readFile(path.join(process.cwd(), "lib/olivia/fonts/NanumSquare-Regular.ttf")),
  ]);
  return renderA4HtmlPdf(buildStatementHtml(statement, {
    logo: png(logo),
    signature: signature ? png(signature) : undefined,
    recipientSignature,
    seal: seal ? png(seal) : undefined,
    koreanFont: `data:font/ttf;base64,${font.toString("base64")}`,
  }), { fitSelector: ".statement-sheet", embeddedAssets: true });
}

export async function statementPdfResponse(statement: TransactionStatement, download = false) {
  let body: BodyInit;
  const savedPath = statement.signed_pdf_path || (statement.status === "sent" ? statement.pdf_path : null);
  if (savedPath) {
    const { data, error } = await getSupabaseAdmin().storage.from(STATEMENT_BUCKET).download(savedPath);
    if (error || !data) throw new TransactionStatementError("저장한 거래명세서 PDF를 읽지 못했습니다.", 500);
    body = data.stream();
  } else {
    body = new Uint8Array(await renderTransactionStatementPdf(statement, statement.status !== "draft"));
  }
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${statement.statement_number}${statement.signed_pdf_path ? "-signed" : ""}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
