import { notFound } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MobileCanonicalContractDocument, MobileCanonicalQuoteDocument } from "@/components/olivia-mobile/MobileCanonicalDocuments";
import { verifyTemporaryDocumentShareToken } from "@/lib/olivia/documents/temporaryDocumentShares";

export const dynamic = "force-dynamic";

function MobileDocument({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main style={{ minHeight: "100vh", background: "#FAF7F2", fontFamily: "Pretendard, sans-serif", color: "#222" }}>
    <header style={{ position: "sticky", top: 0, zIndex: 10, padding: "16px 18px", background: "#155855", color: "white" }}>
      <div style={{ fontSize: 12, opacity: .7 }}>{subtitle} · 7일 미리보기</div>
      <h1 style={{ margin: "5px 0 0", fontSize: 19 }}>{title}</h1>
    </header>
    <div style={{ maxWidth: 620, margin: "0 auto", padding: 14 }}>{children}</div>
  </main>;
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
  if (document.source_table === "quotes") return <MobileDocument title="견적서" subtitle="7일 문서 미리보기"><MobileCanonicalQuoteDocument quote={source} /></MobileDocument>;
  if (document.source_table === "contracts") return <MobileDocument title="계약서" subtitle="7일 문서 미리보기"><MobileCanonicalContractDocument contract={source} /></MobileDocument>;
  if (document.source_table === "conti_runs") {
    const [{ data: groups }, { data: scenes }] = await Promise.all([
      db.from("conti_groups").select("*").eq("run_id", document.source_id).order("sort"),
      db.from("conti_scenes").select("*").eq("run_id", document.source_id).order("sort"),
    ]);
    return <ContiPreview run={source} groups={groups ?? []} scenes={scenes ?? []} />;
  }
  return <MobileDocument title={document.title} subtitle="임시문서"><pre style={{ whiteSpace: "pre-wrap", background: "white", padding: 14, borderRadius: 12 }}>{JSON.stringify(source.data || source, null, 2)}</pre></MobileDocument>;
}
