"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { C, R } from "@/lib/theme";

// 프로젝트별 메모(workflow_runs.project_memo) — 포털엔 노출되지 않는 내부 전용 메모다.
// 기존 프로젝트 수정 API(app/api/clients/[id]/workflow route.ts PATCH)를 그대로 재사용한다.
export default function ProjectMemoPanel({
  clientId,
  activeProject,
  memo,
  onRefresh,
}: {
  clientId: string;
  activeProject: Record<string, any>;
  memo: string;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(memo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}/workflow`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: activeProject.id,
          projectName: activeProject.project_name || "제목 없는 프로젝트",
          managerName: activeProject.manager_name || "",
          shootDate: activeProject.shoot_date || null,
          projectMemo: value,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      setEditing(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pc-card pc-card--padded">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>메모</span>
        {!editing ? (
          <button type="button" onClick={() => { setValue(memo); setEditing(true); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 26, padding: "0 8px", borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            <Plus size={12} />메모 추가
          </button>
        ) : null}
      </div>
      {error ? <p style={{ fontSize: 11, color: C.danger, marginBottom: 6 }}>{error}</p> : null}
      {editing ? (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            placeholder="대표님 요청, 촬영 컨셉 등 내부 메모(고객에게는 보이지 않습니다)"
            style={{ width: "100%", boxSizing: "border-box", borderRadius: R.sm, border: `1px solid ${C.border}`, padding: 8, fontSize: 12, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setEditing(false)} style={{ height: 28, padding: "0 10px", borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>취소</button>
            <button type="button" onClick={save} disabled={saving} style={{ height: 28, padding: "0 12px", borderRadius: R.sm, border: "none", background: C.teal, color: "#fff", fontSize: 11, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: memo ? C.ink : C.hint, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>
          {memo || "등록된 메모가 없습니다."}
        </p>
      )}
    </div>
  );
}
