"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { C, R, FS, SP } from "@/lib/theme";
import { CHANNEL_PRESETS, channelLabel } from "@/lib/marketingChannels";

type Strategy = {
  id: string;
  title: string;
  hypothesis: string;
  channel: string;
  status: "planned" | "active" | "paused" | "completed";
  start_date: string | null;
  target_end_date: string | null;
  baseline_note: string;
  actionTotal: number;
  actionDone: number;
};

const STATUS_LABEL: Record<Strategy["status"], string> = {
  planned: "계획",
  active: "진행중",
  paused: "보류",
  completed: "완료",
};

const STATUS_COLOR: Record<Strategy["status"], string> = {
  planned: C.hint,
  active: C.teal,
  paused: C.gold,
  completed: C.muted,
};

function dDay(targetEndDate: string | null): string | null {
  if (!targetEndDate) return null;
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const target = new Date(targetEndDate);
  const days = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "D-day";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function NewStrategyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [channel, setChannel] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [targetEndDate, setTargetEndDate] = useState("");
  const [baselineNote, setBaselineNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError("전략명을 입력해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/marketing/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, hypothesis, channel,
          startDate, targetEndDate, baselineNote,
          status: "planned",
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || "생성 실패");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 1000, display: "grid", placeItems: "center", padding: 20 }} onClick={onClose}>
      <div
        style={{ background: C.white, borderRadius: R.xl, padding: 24, width: "min(520px, 100%)", maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: FS.xl, fontWeight: 900, color: C.ink }}>새 전략 등록</h2>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={20} /></button>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>전략명 *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 인스타 캡션 정보성 전환 테스트"
              style={{ height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>채널</span>
            <input
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              placeholder="목록에서 선택하거나 직접 입력"
              list="marketing-channel-options"
              style={{ height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 12px", fontSize: FS.md }}
            />
            <datalist id="marketing-channel-options">
              {CHANNEL_PRESETS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </datalist>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>가설 / 기대효과</span>
            <textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} rows={3}
              placeholder="예: 캡션을 정보성으로 바꾸면 저장수가 늘 것이다"
              style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 12, fontSize: FS.md, fontFamily: "inherit", resize: "vertical" }} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>시작일</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                style={{ height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md }} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>목표 종료일</span>
              <input type="date" value={targetEndDate} onChange={(e) => setTargetEndDate(e.target.value)}
                style={{ height: 40, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: FS.md }} />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: FS.sm, fontWeight: 800, color: C.muted }}>베이스라인 메모</span>
            <textarea value={baselineNote} onChange={(e) => setBaselineNote(e.target.value)} rows={2}
              placeholder="예: 최근 5개 게시물 평균 좋아요 22, 저장 3"
              style={{ borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 12, fontSize: FS.md, fontFamily: "inherit", resize: "vertical" }} />
          </label>

          {error && <p style={{ color: C.danger, fontSize: FS.sm, margin: 0 }}>{error}</p>}

          <button onClick={submit} disabled={saving}
            style={{ height: 44, borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontWeight: 800, fontSize: FS.md, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "저장 중…" : "전략 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy, onClick }: { strategy: Strategy; onClick: () => void }) {
  const progress = strategy.actionTotal > 0 ? Math.round((strategy.actionDone / strategy.actionTotal) * 100) : 0;
  const dday = dDay(strategy.target_end_date);

  return (
    <button onClick={onClick} style={{
      textAlign: "left", background: C.white, borderRadius: R.lg, border: `1px solid ${C.border}`,
      padding: 18, cursor: "pointer", display: "grid", gap: 10, transition: "transform 160ms ease, box-shadow 160ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontSize: FS.xs, fontWeight: 900, color: "#fff", background: STATUS_COLOR[strategy.status],
          borderRadius: R.full, padding: "3px 10px",
        }}>{STATUS_LABEL[strategy.status]}</span>
        {dday && <span style={{ fontSize: FS.xs, fontWeight: 800, color: C.muted }}>{dday}</span>}
      </div>

      <h3 style={{ margin: 0, fontSize: FS.lg, fontWeight: 900, color: C.ink, lineHeight: 1.35 }}>{strategy.title}</h3>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: FS.sm, color: C.muted }}>
        <Target size={13} />
        {channelLabel(strategy.channel)}
      </div>

      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: FS.xs, color: C.muted }}>
          <span>액션 진행률</span>
          <span>{strategy.actionDone}/{strategy.actionTotal}</span>
        </div>
        <div style={{ height: 5, borderRadius: R.full, background: C.mint, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: C.teal, borderRadius: R.full, transition: "width .3s" }} />
        </div>
      </div>
    </button>
  );
}

export default function MarketingStrategyListPage() {
  const router = useRouter();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | Strategy["status"]>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | string>("all");
  const [showNewModal, setShowNewModal] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/marketing/strategies", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setStrategies(json?.ok ? json.strategies : []))
      .catch(() => setStrategies([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const channels = useMemo(
    () => Array.from(new Set(strategies.map((s) => s.channel).filter(Boolean))),
    [strategies]
  );

  const filtered = strategies.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (channelFilter !== "all" && s.channel !== channelFilter) return false;
    return true;
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--mesh-bg)" }}>
      <PageHeader
        title="마케팅 대시보드"
        tabs={[{ key: "home", label: "홈" }, { key: "strategy", label: "전략" }]}
        activeTab="strategy"
        onTabChange={(key) => { if (key === "home") router.push("/marketing"); }}
        actions={
          <button onClick={() => setShowNewModal(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
            borderRadius: R.md, border: "none", background: C.orange, color: "#fff", fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
          }}>
            <Plus size={15} /> 새 전략
          </button>
        }
      />

      <div className="oa-page" style={{ maxWidth: 1160, margin: "0 auto", padding: `${SP.lg}px 20px 60px` }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {([["all", "전체"], ["active", "진행중"], ["planned", "계획"], ["paused", "보류"], ["completed", "완료"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key as any)} style={{
              height: 32, padding: "0 14px", borderRadius: R.full, fontSize: FS.sm, fontWeight: 800, cursor: "pointer",
              border: `1px solid ${statusFilter === key ? C.teal : C.border}`,
              background: statusFilter === key ? C.teal : C.white,
              color: statusFilter === key ? "#fff" : C.muted,
            }}>{label}</button>
          ))}

          {channels.length > 0 && (
            <>
              <div style={{ width: 1, background: C.border, margin: "4px 4px" }} />
              <button onClick={() => setChannelFilter("all")} style={{
                height: 32, padding: "0 14px", borderRadius: R.full, fontSize: FS.sm, fontWeight: 800, cursor: "pointer",
                border: `1px solid ${channelFilter === "all" ? C.orange : C.border}`,
                background: channelFilter === "all" ? C.orange : C.white,
                color: channelFilter === "all" ? "#fff" : C.muted,
              }}>전체 채널</button>
              {channels.map((ch) => (
                <button key={ch} onClick={() => setChannelFilter(ch)} style={{
                  height: 32, padding: "0 14px", borderRadius: R.full, fontSize: FS.sm, fontWeight: 800, cursor: "pointer",
                  border: `1px solid ${channelFilter === ch ? C.orange : C.border}`,
                  background: channelFilter === ch ? C.orange : C.white,
                  color: channelFilter === ch ? "#fff" : C.muted,
                }}>{channelLabel(ch)}</button>
              ))}
            </>
          )}
        </div>

        {loading ? (
          <p style={{ color: C.muted, textAlign: "center", padding: 60 }}>불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: C.muted, background: C.white, borderRadius: R.lg, border: `1px dashed ${C.border}` }}>
            <p style={{ margin: "0 0 12px" }}>{strategies.length === 0 ? "아직 등록된 전략이 없어요." : "조건에 맞는 전략이 없어요."}</p>
            {strategies.length === 0 && (
              <button onClick={() => setShowNewModal(true)} style={{
                display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                borderRadius: R.md, border: "none", background: C.teal, color: "#fff", fontWeight: 800, fontSize: FS.sm, cursor: "pointer",
              }}>
                <Plus size={15} /> 첫 전략 등록하기
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {filtered.map((s) => (
              <StrategyCard key={s.id} strategy={s} onClick={() => router.push(`/marketing/strategy/${s.id}`)} />
            ))}
          </div>
        )}
      </div>

      {showNewModal && <NewStrategyModal onClose={() => setShowNewModal(false)} onCreated={load} />}
    </main>
  );
}
