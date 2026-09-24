import { NextRequest, NextResponse } from "next/server";
import { CONTRACT_BRAND_CONFIG } from "@/lib/contract/contractDocument";
import { renderContractPdfBuffer } from "@/lib/contract/renderContractPdf";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFilePart(value: string, fallback: string) {
  const normalized = value.trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_");
  return normalized || fallback;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: contract, error } = await db.from("contracts").select("*").eq("id", id).maybeSingle();

  if (error || !contract) {
    return NextResponse.json({ ok: false, error: "계약서를 찾지 못했어요." }, { status: 404 });
  }

  try {
    const result = await renderContractPdfBuffer(contract as Record<string, unknown>, {
      baseUrl: new URL(request.url).origin,
    });
    const brandLabel = CONTRACT_BRAND_CONFIG[result.brand].label;
    const hospitalName = safeFilePart(result.quote.hospitalName, "고객");
    const contractDate = safeFilePart(result.quote.quoteDate, new Date().toISOString().slice(0, 10));
    const fileName = `${brandLabel}_계약서_${hospitalName}_${contractDate}.pdf`;

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contract.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (renderError) {
    const message = renderError instanceof Error ? renderError.message : "계약서 PDF를 생성하지 못했어요.";
    console.error("[ContractPdf] PDF generation failed", renderError);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
