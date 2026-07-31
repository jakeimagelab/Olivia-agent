"use client";

import { useEffect, useState } from "react";
import { FileSignature, Link2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { C, R, FS } from "@/lib/theme";
import {
  DEFAULT_DETAIL_FIELDS,
  DEFAULT_INTRO_TEXT,
  DEFAULT_USAGE_ITEMS,
  type PortraitConsentField,
} from "@/lib/portraitConsent";

interface ConsentListItem {
  id: string;
  title: string;
  status: "draft" | "sent" | "signed";
  provider_name: string | null;
  signed_at: string | null;
  created_at: string;
}
interface ConsentDetail extends ConsentListItem {
  intro_text: string;
  detail_fields: PortraitConsentField[];
  usage_items: PortraitConsentField[];
  consent_shoot: boolean | null;
  consent_usage: boolean | null;
  signature_data_url: string | null;
  signed_date: string | null;
}

const STATUS_LABEL: Record<ConsentListItem["status"], string> = { draft: "초안", sent: "전달됨", signed: "서명 완료" };
const STATUS_COLOR: Record<ConsentListItem["status"], string> = { draft: C.hint, sent: C.gold, signed: C.success };

function FieldListEditor({
  items, onChange, accent,
}: { items: PortraitConsentField[]; onChange: (next: PortraitConsentField[]) => void; accent: string }) {
  const update = (i: number, patch: Partial<PortraitConsentField>) =>
    onChange(items.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { label: "", value: "" }]);

  return (
    <div>
      {items.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input
            value={f.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="항목명"
            style={{ width: 130, flexShrink: 0, padding: "7px 9px", borderRadius: R.sm, border: `1px solid ${C.border}`, fontSize: FS.sm, fontWeight: 700 }}
          />
          <input
            value={f.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="내용"
            style={{ flex: 1, padding: "7px 9px", borderRadius: R.sm, border: `1px solid ${C.border}`, fontSize: FS.sm }}
          />
          <button type="button" onClick={() => remove(i)} style={{ background: "none", border: "none", color: C.danger, cursor: "pointer", padding: 4 }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: `1px dashed ${accent}`, color: accent, borderRadius: R.sm, padding: "5px 10px", fontSize: FS.xs, fontWeight: 700, cursor: "pointer" }}
      >
        <Plus size={12} /> 항목 추가
      </button>
    </div>
  );
}

export default function PortraitConsentPanel({
  clientId, workflowRunId, hospitalName,
}: { clientId: string | null; workflowRunId: string | null; hospitalName: string }) {
  const [consents, setConsents] = useState<ConsentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ConsentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [introText, setIntroText] = useState(DEFAULT_INTRO_TEXT);
  const [detailFields, setDetailFields] = useState<PortraitConsentField[]>(DEFAULT_DETAIL_FIELDS);
  const [usageItems, setUsageItems] = useState<PortraitConsentField[]>(DEFAULT_USAGE_ITEMS);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<{ id: string; url: string } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const loadList = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (clientId) qs.set("clientId", clientId);
    if (workflowRunId) qs.set("workflowRunId", workflowRunId);
    fetch(`/api/conti/portrait-consents?${qs.toString()}`)
      .then((r) => r.json())
      .then((body) => { if (body.ok) setConsents(body.consents); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadList(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId, workflowRunId]);

  const openCreate = () => {
    setEditingId(null);
    setTitle(hospitalName ? `${hospitalName} 초상권 동의서` : "초상권 동의서");
    setIntroText(DEFAULT_INTRO_TEXT);
    setDetailFields(DEFAULT_DETAIL_FIELDS);
    setUsageItems(DEFAULT_USAGE_ITEMS);
    setFormError("");
    setEditing(true);
  };

  const openEdit = async (id: string) => {
    setFormError("");
    const res = await fetch(`/api/conti/portrait-consents/${id}`);
    const body = await res.json();
    if (!body.ok) { alert(body.error || "불러오기 실패"); return; }
    const c = body.consent as ConsentDetail;
    setEditingId(id);
    setTitle(c.title);
    setIntroText(c.intro_text);
    setDetailFields(c.detail_fields.length ? c.detail_fields : DEFAULT_DETAIL_FIELDS);
    setUsageItems(c.usage_items.length ? c.usage_items : DEFAULT_USAGE_ITEMS);
    setEditing(true);
  };

  const openView = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/conti/portrait-consents/${id}`);
      const body = await res.json();
      if (body.ok) setDetail(body.consent);
    } finally {
      setDetailLoading(false);
    }
  };

  const save = async () => {
    if (!title.trim()) { setFormError("제목을 입력해 주세요."); return; }
    setSaving(true);
    setFormError("");
    try {
      const payload = { clientId, workflowRunId, title, introText, detailFields, usageItems };
      const res = editingId
        ? await fetch(`/api/conti/portrait-consents/${editingId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, introText, detailFields, usageItems }),
          })
        : await fetch("/api/conti/portrait-consents", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
          });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "저장 실패");
      setEditing(false);
      loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("이 초상권 동의서를 삭제할까요?")) return;
    const res = await fetch(`/api/conti/portrait-consents/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!body.ok) { alert(body.error || "삭제 실패"); return; }
    loadList();
  };

  const generateLink = async (id: string) => {
    setShareBusyId(id);
    setShareLink(null);
    setShareCopied(false);
    try {
      const res = await fetch(`/api/conti/portrait-consents/${id}/share`, { method: "POST" });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || "링크 생성 실패");
      const url = `${window.location.origin}/portrait-consent/${body.token}`;
      setShareLink({ id, url });
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareCopied(true);
      loadList();
    } catch (err) {
      alert(err instanceof Error ? err.message : "링크 생성 실패");
    } finally {
      setShareBusyId(null);
    }
  };

  const btnPrimary: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px",
    borderRadius: R.sm, border: "none", background: C.teal, color: "#fff",
    fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px",
    borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.ink,
    fontWeight: 700, fontSize: FS.xs, cursor: "pointer",
  };

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink, display: "flex", alignItems: "center", gap: 8 }}>
            <FileSignature size={18} color={C.teal} /> 초상권 동의서
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: FS.sm, color: C.muted }}>
            제공자에게 포털 링크를 전달하면, 링크를 연 사람이 직접 서명해 DB에 저장됩니다. 파일로 전달하지 않습니다.
          </p>
        </div>
        <button type="button" onClick={openCreate} style={btnPrimary}>
          <Plus size={15} /> 새 동의서 작성
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.hint, fontSize: FS.sm }}>불러오는 중…</div>
      ) : consents.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: C.hint, fontSize: FS.sm, background: "#fff", borderRadius: R.lg, border: `1px solid ${C.border}` }}>
          작성된 초상권 동의서가 없습니다.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {consents.map((c) => (
            <div key={c.id} style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.lg, padding: "14px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, color: C.ink, fontSize: FS.md, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
                  <span style={{ fontSize: FS.xs, fontWeight: 800, color: "#fff", background: STATUS_COLOR[c.status], borderRadius: R.full, padding: "3px 10px", flexShrink: 0 }}>
                    {STATUS_LABEL[c.status]}
                  </span>
                  {c.provider_name && <span style={{ fontSize: FS.xs, color: C.muted, flexShrink: 0 }}>{c.provider_name}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {c.status === "signed" ? (
                    <button type="button" onClick={() => openView(c.id)} style={btnGhost}>보기</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => openEdit(c.id)} style={btnGhost}><Pencil size={12} /> 편집</button>
                      <button
                        type="button" onClick={() => generateLink(c.id)} disabled={shareBusyId === c.id}
                        style={{ ...btnGhost, borderColor: C.orange, color: C.orange, opacity: shareBusyId === c.id ? 0.6 : 1 }}
                      >
                        {shareBusyId === c.id ? <Loader2 size={12} className="spin" /> : <Link2 size={12} />}
                        {shareLink?.id === c.id && shareCopied ? "복사됨!" : "포털 링크"}
                      </button>
                      <button type="button" onClick={() => remove(c.id)} style={{ ...btnGhost, color: C.danger, borderColor: "rgba(220,38,38,0.3)" }}>
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {shareLink?.id === c.id && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: C.mint, borderRadius: R.sm, fontSize: FS.xs, color: C.teal, wordBreak: "break-all" }}>
                  {shareLink.url}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 작성/편집 모달 ── */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setEditing(false)}>
          <div style={{ background: "#fff", borderRadius: R.xl, width: "min(640px, 100%)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#fff" }}>
              <span style={{ fontWeight: 900, fontSize: FS.lg, color: C.ink }}>{editingId ? "초상권 동의서 편집" : "새 초상권 동의서"}</span>
              <button onClick={() => setEditing(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.hint }}><X size={20} /></button>
            </div>
            <div style={{ padding: 22 }}>
              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.ink, marginBottom: 6 }}>제목</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: R.sm, border: `1.5px solid ${C.border}`, fontSize: FS.md, boxSizing: "border-box", marginBottom: 16 }} />

              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.ink, marginBottom: 6 }}>안내 문구</label>
              <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: R.sm, border: `1.5px solid ${C.border}`, fontSize: FS.sm, boxSizing: "border-box", marginBottom: 16, resize: "vertical", lineHeight: 1.6 }} />

              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.teal, marginBottom: 6 }}>사진(영상)촬영 — 세부 내용</label>
              <div style={{ marginBottom: 16 }}><FieldListEditor items={detailFields} onChange={setDetailFields} accent={C.teal} /></div>

              <label style={{ display: "block", fontSize: FS.sm, fontWeight: 800, color: C.orange, marginBottom: 6 }}>영상/사진(이미지) 활용 목적</label>
              <div style={{ marginBottom: 8 }}><FieldListEditor items={usageItems} onChange={setUsageItems} accent={C.orange} /></div>

              {formError && <div style={{ color: C.danger, fontSize: FS.sm, fontWeight: 700, marginTop: 8 }}>{formError}</div>}

              <button type="button" onClick={save} disabled={saving} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 18, padding: "11px 0", opacity: saving ? 0.7 : 1 }}>
                {saving ? "저장 중…" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 서명 완료 상세 보기 ── */}
      {(detailLoading || detail) && (
        <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setDetail(null)}>
          <div style={{ background: "#fff", borderRadius: R.xl, width: "min(560px, 100%)", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <div style={{ padding: 40, textAlign: "center", color: C.hint }}>불러오는 중…</div>
            ) : (
              <>
                <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 900, fontSize: FS.lg, color: C.ink }}>{detail.title}</span>
                  <button onClick={() => setDetail(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.hint }}><X size={20} /></button>
                </div>
                <div style={{ padding: 22 }}>
                  <div style={{ fontSize: FS.sm, color: C.ink, marginBottom: 6 }}>사진 촬영 동의: <b>{detail.consent_shoot ? "예" : "아니오"}</b></div>
                  <div style={{ fontSize: FS.sm, color: C.ink, marginBottom: 16 }}>홍보 목적 사용 동의: <b>{detail.consent_usage ? "예" : "아니오"}</b></div>
                  <div style={{ fontSize: FS.sm, color: C.muted, marginBottom: 4 }}>초상권 제공자: <b style={{ color: C.ink }}>{detail.provider_name}</b></div>
                  <div style={{ fontSize: FS.sm, color: C.muted, marginBottom: 12 }}>서명일: {detail.signed_date}</div>
                  {detail.signature_data_url && (
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.md, padding: 12, textAlign: "center" }}>
                      <img src={detail.signature_data_url} alt="서명" style={{ maxHeight: 100 }} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
