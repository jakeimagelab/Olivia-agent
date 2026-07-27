"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarPlus, MapPin } from "lucide-react";
import { C, R } from "@/lib/theme";

const CATEGORY_LABEL: Record<string, string> = { shooting: "촬영", client: "고객", admin: "행정", personal: "개인", general: "기타" };

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };

export default function ClientScheduleTab({ hospitalName }: { hospitalName: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), title: "", time: "", location: "", category: "client" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!hospitalName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/pcrm/schedule?hospitalName=${encodeURIComponent(hospitalName)}`, { cache: "no-store" });
      const d = await res.json();
      if (d.ok) setTasks(d.tasks || []);
    } finally {
      setLoading(false);
    }
  }, [hospitalName]);

  useEffect(() => { void load(); }, [load]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = tasks.filter((t) => t.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date));
  const past = tasks.filter((t) => t.date < todayStr);

  const addTask = async () => {
    if (!form.title.trim()) { window.alert("일정명을 입력해주세요."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          title: `${hospitalName} ${form.title.trim()}`,
          time: form.time || undefined,
          location: form.location || undefined,
          category: form.category,
        }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "일정 추가 실패");
      setShowForm(false);
      setForm({ date: new Date().toISOString().slice(0, 10), title: "", time: "", location: "", category: "client" });
      await load();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "일정 추가 실패");
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (task: any) => (
    <div key={task.id} className="pcrm-schedule-row">
      <div className="pcrm-schedule-row__date">
        <strong>{task.date.slice(5).replace("-", ".")}</strong>
        <span>{task.time ? task.time.slice(0, 5) : "종일"}</span>
      </div>
      <div className="pcrm-schedule-row__body">
        <strong>{task.title}</strong>
        {task.location && <span><MapPin size={11} /> {task.location}</span>}
      </div>
      <i data-state={task.completed ? "done" : "active"}>{CATEGORY_LABEL[task.category] || task.category}</i>
    </div>
  );

  return (
    <section className="pcrm-project-panel" style={cardStyle}>
      <header>
        <div><h2>일정</h2><span>병원명이 포함된 일정을 모아 보여줍니다.</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="pcrm-inline-action" onClick={() => setShowForm((v) => !v)}><CalendarPlus size={13} /> 일정 추가</button>
          <Link href="/calendar" className="pcrm-inline-action" style={{ textDecoration: "none" }}>캘린더 열기</Link>
        </div>
      </header>
      {showForm && (
        <div className="pcrm-schedule-form">
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="일정명 (예: 촬영, 상담)" />
          <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="장소" />
          <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button type="button" className="pc-btn pc-btn--orange pc-btn--sm" disabled={saving} onClick={() => void addTask()}>{saving ? "저장 중..." : "저장"}</button>
        </div>
      )}
      <div className="pcrm-schedule-list">
        {loading ? (
          <p className="pcrm-empty-copy">불러오는 중...</p>
        ) : tasks.length === 0 ? (
          <p className="pcrm-empty-copy">연결된 일정이 없습니다.</p>
        ) : (
          <>
            {upcoming.length > 0 && <><div className="pcrm-schedule-section-label">예정</div>{upcoming.map(renderRow)}</>}
            {past.length > 0 && <><div className="pcrm-schedule-section-label">지난 일정</div>{past.slice(0, 10).map(renderRow)}</>}
          </>
        )}
      </div>
    </section>
  );
}
