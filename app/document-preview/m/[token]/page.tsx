import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import QuotePreviewMobile, { type PreviewQuote } from "@/components/quote-preview/QuotePreviewMobile";
import { verifyTemporaryDocumentShareToken } from "@/lib/olivia/documents/temporaryDocumentShares";

export const dynamic = "force-dynamic";

function quotePreview(row: Record<string, unknown>): PreviewQuote {
  const form = row.form_state && typeof row.form_state === "object" ? row.form_state as Record<string, unknown> : {};
  return {
    quoteNumber: String(row.quote_number || ""), title: String(row.title || ""), hospitalName: String(row.hospital_name || ""),
    quoteDate: String(row.quote_date || ""), shootDate: String(row.shoot_date || ""), validUntil: String(row.valid_until || ""),
    items: Array.isArray(row.items) ? row.items as PreviewQuote["items"] : [], supplyAmount: Number(row.supply_amount) || 0,
    discountAmount: Number(row.discount_amount) || 0, vat: Number(row.vat) || 0, totalAmount: Number(row.total_amount) || 0,
    depositAmount: Number(row.deposit_amount) || 0, balanceAmount: Number(row.balance_amount) || 0,
    depositRate: Number(row.deposit_rate) || 50, memos: String(row.memos || ""), status: String(row.status || "draft"),
    brand: form.brand === "jakeimage" ? "jakeimage" : "photoclinic", updatedAt: String(row.updated_at || ""),
  };
}

const won = (value: unknown) => `${(Number(value) || 0).toLocaleString("ko-KR")}원`;

function MobileDocument({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", background: "#FAF7F2", fontFamily: "Pretendard, sans-serif", color: "#222" }}>
    <header style={{ position: "sticky", top: 0, zIndex: 10, padding: "16px 18px", background: "#155855", color: "white" }}>
      <div style={{ fontSize: 12, opacity: .7 }}>{subtitle} · 7일 미리보기</div>
      <h1 style={{ margin: "5px 0 0", fontSize: 19 }}>{title}</h1>
    </header>
    <div style={{ maxWidth: 620, margin: "0 auto", padding: 14 }}>{children}</div>
  </main>;
}

function ContractPreview({ row }: { row: Record<string, unknown> }) {
  const quote = row.quote_data && typeof row.quote_data === "object" ? row.quote_data as Record<string, unknown> : {};
  const items = Array.isArray(quote.items) ? quote.items as Record<string, unknown>[] : [];
  const hospital = String(row.hospital_name || quote.hospitalName || "고객");
  return <MobileDocument title={`${hospital} 계약서`} subtitle="촬영 계약서">
    <section style={{ background: "white", borderRadius: 12, padding: 14, border: "1px solid rgba(21,88,85,.12)" }}>
      <p style={{ marginTop: 0, fontSize: 13, color: "#667" }}>담당자 {String(row.contact_name || quote.contactName || "-")} · {String(row.email || quote.email || "-")}</p>
      {items.map((item, index) => <div key={String(item.id || index)} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid #eee", fontSize: 13 }}>
        <span>{String(item.name || "계약 항목")}</span><b>{won(item.subtotal)}</b>
      </div>)}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 14, marginTop: 4, borderTop: "2px solid #155855" }}><b>총 계약금액</b><b style={{ color: "#E85D2C", fontSize: 19 }}>{won(quote.totalAmount ?? quote.total_amount)}</b></div>
    </section>
    {[row.payment_terms, row.delivery_terms, row.special_terms].filter(Boolean).length ? <section style={{ marginTop: 12, background: "white", borderRadius: 12, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
      {row.payment_terms ? <p><b>결제 조건</b><br />{String(row.payment_terms)}</p> : null}
      {row.delivery_terms ? <p><b>납품 조건</b><br />{String(row.delivery_terms)}</p> : null}
      {row.special_terms ? <p><b>특약</b><br />{String(row.special_terms)}</p> : null}
    </section> : null}
  </MobileDocument>;
}

function ContiPreview({ run, groups, scenes }: { run: Record<string, unknown>; groups: Record<string, unknown>[]; scenes: Record<string, unknown>[] }) {
  const names = new Map(groups.map((group) => [String(group.id), String(group.name || "미지정")]));
  return <MobileDocument title={`${String(run.hospital_name || "고객")} 촬영 콘티`} subtitle={String(run.specialty || "촬영 콘티")}>
    <div style={{ display: "grid", gap: 10 }}>{scenes.map((scene, index) => <article key={String(scene.id || index)} style={{ background: "white", borderRadius: 12, border: "1px solid rgba(21,88,85,.12)", padding: 13 }}>
      <div style={{ color: "#E85D2C", fontSize: 11, fontWeight: 800 }}>{index + 1} · {names.get(String(scene.group_id)) || "미지정"}</div>
      <h2 style={{ fontSize: 15, margin: "5px 0" }}>{String(scene.name || scene.keyword || "장면")}</h2>
      <p style={{ margin: 0, color: "#666", fontSize: 12, lineHeight: 1.6 }}>{String(scene.description || "")}</p>
      <div style={{ marginTop: 8, fontSize: 11, color: "#888" }}>{String(scene.space_text || "장소 미정")}{scene.minutes ? ` · ${scene.minutes}분` : ""}</div>
    </article>)}</div>
  </MobileDocument>;
}

export default async function TemporaryDocumentPreview({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getSupabaseAdmin();
  const share = verifyTemporaryDocumentShareToken(token);
  if (!share) notFound();
  const { data: document } = await db.from("temporary_documents").select("*").eq("id", share.temporaryDocumentId).maybeSingle();
  if (!document) notFound();
  const { data: source } = await db.from(document.source_table).select("*").eq("id", document.source_id).maybeSingle();
  if (!source) notFound();
  if (document.source_table === "quotes") return <QuotePreviewMobile initialQuote={quotePreview(source)} />;
  if (document.source_table === "contracts") return <ContractPreview row={source} />;
  if (document.source_table === "conti_runs") {
    const [{ data: groups }, { data: scenes }] = await Promise.all([
      db.from("conti_groups").select("*").eq("run_id", document.source_id).order("sort"),
      db.from("conti_scenes").select("*").eq("run_id", document.source_id).order("sort"),
    ]);
    return <ContiPreview run={source} groups={groups ?? []} scenes={scenes ?? []} />;
  }
  return <MobileDocument title={document.title} subtitle="임시문서"><pre style={{ whiteSpace: "pre-wrap", background: "white", padding: 14, borderRadius: 12 }}>{JSON.stringify(source.data || source, null, 2)}</pre></MobileDocument>;
}
