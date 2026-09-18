"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { C, R } from "@/lib/theme";
import { todayStr } from "@/lib/work-journal/dateLabel";
import type { TaskListItem } from "@/lib/work-journal/types";

// work_journal_tasks — 특정 촬영 일정과 무관한 범용 "오늘 할 일"(Hermes의 work_list_today/
// work_journal_* tool이 쓰는 것과 같은 테이블). 이 화면의 나머지 3컬럼(ScheduleColumn/TodoColumn/
// PreparationColumn)은 전부 calendar_tasks에 연결된 촬영 일정 전용이라, 이 항목들을 보여줄 곳이
// 지금까지 없었다 — Hermes가 "오늘 할 일 추가해줘"로 실제 DB에 써도 아무 화면에도 안 보이는
// 문제였다(Phase 2 감사 §3에서 발견). 기존 컬럼 레이아웃은 그대로 두고, 그 위에 독립된 패널로
// 하나 추가한다 — 새 DB/새 API 없이 기존 /api/work-journal/tasks만 그대로 쓴다.
async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`요청에 실패했습니다. (${response.status})`);
  }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

export default function GeneralTasksPanel() {
  const [date, setDate] = useState(() => todayStr());
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson(`/api/work-journal/tasks?date=${date}`);
      setTasks(data.tasks ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  // Hermes(work_journal_list/create/update/complete 등)가 이 테이블을 바꾸면
  // actionRouter.ts가 이 이벤트를 쏜다(inferResource가 tool 이름에 "work"가 있으면 자동으로
  // resource:"work"로 추론) — QuoteBuilder/ContractBuilder/콘티와 동일 패턴, 새로고침 없이
  // 즉시 반영한다.
  useEffect(() => {
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent).detail as { resource?: string } | undefined;
      if (!detail?.resource || detail.resource === "work") void load();
    };
    window.addEventListener("olivia-resource-refresh", onRefresh);
    return () => window.removeEventListener("olivia-resource-refresh", onRefresh);
  }, [load]);

  const submit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetchJson("/api/work-journal/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dueDate: date, title: title.trim() }),
      });
      setTitle(""); setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = async (task: TaskListItem) => {
    const nextStatus = task.status === "done" ? "pending" : "done";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    try {
      await fetchJson(`/api/work-journal/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      void load();
    }
  };

  const done = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="pc-card pc-card--padded" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.ink }}>오늘 할 일</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ height: 28, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 8px", fontSize: 12 }}
          />
          <span style={{ fontSize: 11, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: R.full, padding: "2px 8px" }}>
            {done} / {tasks.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", borderRadius: R.sm, border: "none", background: C.orange, color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer" }}
        >
          <Plus size={13} />추가
        </button>
      </div>

      {error ? <p style={{ fontSize: 11.5, color: C.danger, marginBottom: 8 }}>{error}</p> : null}

      {adding ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="할 일 제목"
            style={{ flex: 1, height: 30, borderRadius: R.sm, border: `1px solid ${C.border}`, padding: "0 10px", fontSize: 12.5 }}
          />
          <button type="button" onClick={submit} disabled={!title.trim() || submitting}
            style={{ height: 30, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 800, cursor: !title.trim() || submitting ? "not-allowed" : "pointer", opacity: !title.trim() || submitting ? 0.6 : 1 }}>
            {submitting ? "추가 중..." : "추가"}
          </button>
        </div>
      ) : null}

      {loading ? (
        <p style={{ fontSize: 12, color: C.hint }}>불러오는 중...</p>
      ) : tasks.length === 0 ? (
        <p style={{ fontSize: 12, color: C.hint }}>이 날짜에 등록된 할 일이 없습니다.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {tasks.map((task) => (
            <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: R.full, padding: "5px 10px 5px 5px", border: `1px solid ${C.border}`, background: "#fff" }}>
              <button
                type="button"
                onClick={() => toggle(task)}
                aria-label="완료 표시"
                style={{ width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${task.status === "done" ? C.success : C.border}`, background: task.status === "done" ? C.success : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              >
                {task.status === "done" ? <Check size={11} color="#fff" strokeWidth={3} /> : null}
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: task.status === "done" ? C.hint : C.ink, textDecoration: task.status === "done" ? "line-through" : "none" }}>
                {task.title}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
