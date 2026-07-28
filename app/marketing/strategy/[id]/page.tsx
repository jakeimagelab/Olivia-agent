"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ExternalLink, Plus, Sparkles, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { C, R, FS, SP } from "@/lib/theme";
import { CHANNEL_PRESETS, channelLabel, metricLabel, metricPresetsForChannel } from "@/lib/marketingChannels";

type MetricLog = {
  id: string;
  metric_type: string;
  unit: string;
  value: number;
  recorded_at: string;
  note: string;
};

type Action = {
  id: string;
  strategy_id: string;
  title: string;
  description: string;
  scheduled_date: string | null;
  completed_date: string | null;
  status: "pending" | "done" | "skipped";
  related_post_url: string;
  metrics: MetricLog[];
};

type Suggestion = {
  id: string;
  strategy_id: string;
  suggested_title: string;
  suggested_description: string;
  rationale: string;
  status: "pending" | "accepted" | "dismissed";
};

type Strategy = {
  id: string;
  title: string;
  hypothesis: string;
  channel: string;
  status: "planned" | "active" | "paused" | "completed";
  start_date: string | null;
  target_end_date: string | null;
  baseline_note: string;
};

const STATUS_LABEL: Record<Strategy["status"], string> = {
  planned: "계획", active: "진행중", paused: "보류", completed: "완료",
};

function isOverdue(action: Action): boolean {
  if (action.status !== "pending" || !action.scheduled_date) return false;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return action.scheduled_date < today;
}

function NewActionForm({ strategyId, onClose, onCreated }: { strategyId: string; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [relatedPostUrl, setRelatedPostUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError("액션명을 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/marketing/strategies/${strategyId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, scheduledDate, relatedPostUrl }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "추가 실패");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "추가 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.mint, borderRadius: R.lg, padding: 16, display: "grid", gap: 10, marginBottom: 16 }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="액션명 (예: 정보성 캡션 게시물 1차 업로드)"
        style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md, background: C.white }} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="세부 지시사항/체크리스트 (선택)"
        style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 10, fontSize: FS.md, fontFamily: "inherit", resize: "vertical", background: C.white }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
          style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md, background: C.white }} />
        <input value={relatedPostUrl} onChange={(e) => setRelatedPostUrl(e.target.value)} placeholder="관련 게시물 링크 (선택)"
          style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md, background: C.white }} />
      </div>
      {error && <p style={{ color: C.danger, fontSize: FS.sm, margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={saving} style={{
          height: 38, padding: "0 16px", borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontWeight: 800, fontSize: FS.sm, cursor: "pointer", opacity: saving ? 0.6 : 1,
        }}>{saving ? "추가 중…" : "액션 추가"}</button>
        <button onClick={onClose} style={{
          height: 38, padding: "0 16px", borderRadius: R.md, border: `1px solid ${C.border}`, background: C.white, color: C.muted, fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
        }}>취소</button>
      </div>
    </div>
  );
}

function MetricModal({ action, channel, onClose, onSaved }: { action: Action; channel: string; onClose: () => void; onSaved: () => void }) {
  const presets = metricPresetsForChannel(channel);
  const [rows, setRows] = useState<{ metricType: string; unit: string; value: string; note: string }[]>([
    { metricType: presets[0] ?? "", unit: "count", value: "", note: "" },
  ]);
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateRow = (index: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((current) => [...current, { metricType: "", unit: "count", value: "", note: "" }]);
  const removeRow = (index: number) => setRows((current) => current.filter((_, i) => i !== index));

  const submit = async () => {
    const validRows = rows.filter((r) => r.metricType.trim() && r.value.trim());
    if (validRows.length === 0) { setError("지표 종류와 값을 1개 이상 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/marketing/actions/${action.id}/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordedAt, metrics: validRows }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "저장 실패");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div style={{ background: C.white, borderRadius: R.xl, padding: 24, width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>지표 입력</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={20} /></button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: FS.sm, color: C.muted }}>{action.title}</p>

        <label style={{ display: "grid", gap: 6, marginBottom: 12 }}>
          <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>측정일</span>
          <input type="date" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)}
            style={{ height: 38, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md, width: 180 }} />
        </label>

        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.7fr auto", gap: 8, alignItems: "center" }}>
              <input value={row.metricType} onChange={(e) => updateRow(i, { metricType: e.target.value })}
                placeholder="지표 (예: saves)" list="marketing-metric-options"
                style={{ height: 36, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.sm }} />
              <input value={row.value} onChange={(e) => updateRow(i, { value: e.target.value })} placeholder="값" inputMode="decimal"
                style={{ height: 36, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.sm }} />
              <input value={row.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} placeholder="단위"
                style={{ height: 36, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.sm }} />
              <button onClick={() => removeRow(i)} disabled={rows.length === 1} style={{
                border: "none", background: "transparent", color: C.danger, cursor: rows.length === 1 ? "not-allowed" : "pointer", opacity: rows.length === 1 ? 0.3 : 1,
              }}><X size={16} /></button>
            </div>
          ))}
          <datalist id="marketing-metric-options">
            {presets.map((m) => <option key={m} value={m}>{metricLabel(m)}</option>)}
          </datalist>
          <button onClick={addRow} style={{
            display: "inline-flex", alignItems: "center", gap: 6, justifySelf: "start",
            border: "none", background: "transparent", color: C.teal, fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
          }}><Plus size={14} /> 지표 추가</button>
        </div>

        {error && <p style={{ color: C.danger, fontSize: FS.sm, margin: "12px 0 0" }}>{error}</p>}

        <button onClick={submit} disabled={saving} style={{
          marginTop: 16, height: 44, width: "100%", borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontWeight: 800, fontSize: FS.md, cursor: "pointer", opacity: saving ? 0.6 : 1,
        }}>{saving ? "저장 중…" : "지표 저장"}</button>
      </div>
    </div>
  );
}

export default function StrategyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const strategyId = params?.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActionForm, setShowActionForm] = useState(false);
  const [metricModalAction, setMetricModalAction] = useState<Action | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  const load = () => {
    setLoading(true);
    fetch(`/api/marketing/strategies/${strategyId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) { setStrategy(json.strategy); setActions(json.actions); }
      })
      .finally(() => setLoading(false));
  };

  const loadSuggestions = () => {
    fetch(`/api/marketing/strategies/${strategyId}/suggestions`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setSuggestions(json?.ok ? json.suggestions.filter((s: Suggestion) => s.status === "pending") : []))
      .catch(() => {});
  };

  useEffect(() => { if (strategyId) { load(); loadSuggestions(); } }, [strategyId]);

  const requestSuggestions = async () => {
    setSuggesting(true);
    setSuggestError("");
    try {
      const res = await fetch(`/api/marketing/strategies/${strategyId}/suggestions`, { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "제안 생성 실패");
      loadSuggestions();
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : "제안 생성 실패");
    } finally {
      setSuggesting(false);
    }
  };

  const resolveSuggestion = async (suggestion: Suggestion, status: "accepted" | "dismissed") => {
    setSuggestions((current) => current.filter((s) => s.id !== suggestion.id));
    await fetch(`/api/marketing/suggestions/${suggestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
    if (status === "accepted") load();
  };

  const toggleActionDone = async (action: Action) => {
    const nextStatus = action.status === "done" ? "pending" : "done";
    setActions((current) => current.map((a) => (a.id === action.id ? { ...a, status: nextStatus } : a)));
    await fetch(`/api/marketing/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    }).catch(() => {});
    load();
  };

  const changeStrategyStatus = async (status: Strategy["status"]) => {
    if (!strategy) return;
    setStrategy({ ...strategy, status });
    await fetch(`/api/marketing/strategies/${strategyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  };

  const allMetrics = useMemo(
    () => actions.flatMap((a) => a.metrics.map((m) => ({ ...m, actionTitle: a.title }))),
    [actions]
  );

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
        <PageHeader title="마케팅 대시보드" />
        <p style={{ textAlign: "center", color: C.muted, padding: 80 }}>불러오는 중…</p>
      </main>
    );
  }

  if (!strategy) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
        <PageHeader title="마케팅 대시보드" />
        <p style={{ textAlign: "center", color: C.muted, padding: 80 }}>전략을 찾을 수 없습니다.</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
      <PageHeader
        title="마케팅 대시보드"
        tabs={[{ key: "home", label: "홈" }, { key: "strategy", label: "전략" }]}
        activeTab="strategy"
        onTabChange={(key) => { if (key === "home") router.push("/marketing"); }}
      />

      <div className="oa-page" style={{ maxWidth: 880, margin: "0 auto", padding: `${SP.lg}px 20px 60px` }}>
        <button onClick={() => router.push("/marketing/strategy")} style={{
          display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent",
          color: C.muted, fontWeight: 700, fontSize: FS.sm, cursor: "pointer", marginBottom: 16, padding: 0,
        }}><ArrowLeft size={15} /> 전략 목록</button>

        <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`, padding: 22, marginBottom: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: R.full, padding: "3px 12px" }}>
              {channelLabel(strategy.channel)}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              {(Object.keys(STATUS_LABEL) as Strategy["status"][]).map((s) => (
                <button key={s} onClick={() => changeStrategyStatus(s)} style={{
                  height: 28, padding: "0 10px", borderRadius: R.full, fontSize: FS.xs, fontWeight: 800, cursor: "pointer",
                  border: `1px solid ${strategy.status === s ? C.teal : C.border}`,
                  background: strategy.status === s ? C.teal : "transparent",
                  color: strategy.status === s ? "#fff" : C.muted,
                }}>{STATUS_LABEL[s]}</button>
              ))}
            </div>
          </div>

          <h1 style={{ margin: "0 0 10px", fontSize: FS.xxl, fontWeight: 900, color: C.ink }}>{strategy.title}</h1>

          {strategy.hypothesis && (
            <p style={{ margin: "0 0 12px", fontSize: FS.md, color: C.ink, lineHeight: 1.6, background: C.bg, borderRadius: R.md, padding: 12 }}>
              💡 {strategy.hypothesis}
            </p>
          )}

          {strategy.baseline_note && (
            <p style={{ margin: 0, fontSize: FS.sm, color: C.muted, lineHeight: 1.6 }}>
              베이스라인: {strategy.baseline_note}
            </p>
          )}

          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: FS.xs, color: C.hint }}>
            {strategy.start_date && <span>시작 {strategy.start_date}</span>}
            {strategy.target_end_date && <span>목표 종료 {strategy.target_end_date}</span>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink }}>액션 타임라인</h2>
          <button onClick={() => setShowActionForm((v) => !v)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px",
            borderRadius: R.md, border: "none", background: C.orange, color: "#fff", fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
          }}><Plus size={14} /> 액션 추가</button>
        </div>

        {showActionForm && <NewActionForm strategyId={strategyId} onClose={() => setShowActionForm(false)} onCreated={load} />}

        {actions.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: C.muted, background: C.white, borderRadius: R.lg, border: `1px dashed ${C.border}` }}>
            아직 등록된 액션이 없어요.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
            {actions.map((action) => {
              const overdue = isOverdue(action);
              return (
                <div key={action.id} style={{
                  display: "flex", gap: 12, alignItems: "flex-start", background: C.white, borderRadius: R.md,
                  border: `1px solid ${overdue ? C.danger : C.border}`, padding: 14,
                }}>
                  <button onClick={() => toggleActionDone(action)} style={{
                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 2, cursor: "pointer",
                    border: `2px solid ${action.status === "done" ? C.success : C.border}`,
                    background: action.status === "done" ? C.success : "transparent",
                    display: "grid", placeItems: "center",
                  }}>
                    {action.status === "done" && <Check size={14} color="#fff" />}
                  </button>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <strong style={{
                        fontSize: FS.md, color: C.ink, textDecoration: action.status === "done" ? "line-through" : "none",
                        opacity: action.status === "done" ? 0.6 : 1,
                      }}>{action.title}</strong>
                      {action.scheduled_date && (
                        <span style={{ fontSize: FS.xs, fontWeight: 800, color: overdue ? "#fff" : C.muted, background: overdue ? C.danger : C.bg, borderRadius: R.full, padding: "2px 8px" }}>
                          {overdue ? "지연됨 · " : ""}{action.scheduled_date}
                        </span>
                      )}
                      {action.related_post_url && (
                        <a href={action.related_post_url} target="_blank" rel="noreferrer" style={{ color: C.teal, display: "inline-flex", alignItems: "center", gap: 3, fontSize: FS.xs }}>
                          링크 <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    {action.description && <p style={{ margin: "6px 0 0", fontSize: FS.sm, color: C.muted, lineHeight: 1.5 }}>{action.description}</p>}

                    {action.metrics.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {action.metrics.map((m) => (
                          <span key={m.id} style={{ fontSize: FS.xs, fontWeight: 700, color: C.teal, background: C.mint, borderRadius: R.xs, padding: "3px 8px" }}>
                            {metricLabel(m.metric_type)} {m.value}{m.unit && m.unit !== "count" ? m.unit : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => setMetricModalAction(action)} style={{
                    flexShrink: 0, height: 30, padding: "0 12px", borderRadius: R.sm, border: `1px solid ${C.border}`,
                    background: C.white, color: C.teal, fontWeight: 800, fontSize: FS.xs, cursor: "pointer",
                  }}>지표 입력</button>
                </div>
              );
            })}
          </div>
        )}

        {allMetrics.length > 0 && (
          <div>
            <h2 style={{ margin: "0 0 12px", fontSize: FS.lg, fontWeight: 900, color: C.ink }}>지표 기록</h2>
            <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: FS.sm }}>
                <thead>
                  <tr style={{ background: C.bg, color: C.muted, textAlign: "left" }}>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>액션</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>지표</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>값</th>
                    <th style={{ padding: "10px 14px", fontWeight: 800 }}>측정일</th>
                  </tr>
                </thead>
                <tbody>
                  {allMetrics.map((m) => (
                    <tr key={m.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px", color: C.ink }}>{m.actionTitle}</td>
                      <td style={{ padding: "10px 14px", color: C.ink }}>{metricLabel(m.metric_type)}</td>
                      <td style={{ padding: "10px 14px", color: C.ink, fontWeight: 800 }}>{m.value}{m.unit && m.unit !== "count" ? m.unit : ""}</td>
                      <td style={{ padding: "10px 14px", color: C.muted }}>{m.recorded_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {metricModalAction && (
        <MetricModal
          action={metricModalAction}
          channel={strategy.channel}
          onClose={() => setMetricModalAction(null)}
          onSaved={load}
        />
      )}
    </main>
  );
}
