"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { C } from "@/lib/theme";

export type NewTaskDefaults = {
  title?: string;
  description?: string;
  roomId?: string;
  sourceMessageId?: string;
  projectId?: string;
};

export default function NewTaskDialog({
  open,
  onClose,
  onCreated,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (task: any) => void;
  defaults?: NewTaskDefaults;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(defaults?.title ?? "");
    setError("");
  }, [open, defaults]);
  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/team/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: defaults?.description || undefined,
          projectId: defaults?.projectId || undefined,
          roomId: defaults?.roomId || null,
          sourceMessageId: defaults?.sourceMessageId || null,
        }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
      onCreated(data.task);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "업무 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(28,43,40,.35)", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="team-card" style={{ width: "min(420px,100%)", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div><h2 style={{ fontSize: 18, color: C.teal, margin: 0 }}>새 할 일</h2><p style={{ fontSize: 11, color: C.muted, margin: "5px 0 0" }}>할 일 제목만 적어 바로 추가하세요.</p></div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ display: "grid", gap: 13 }}>
          <input
            className="team-input"
            maxLength={200}
            required
            autoFocus
            placeholder="예: 미소로한의원 촬영 준비물 확인"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          {error ? <div className="team-error">{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><button type="button" className="team-button secondary" onClick={onClose}>취소</button><button type="submit" className="team-button" disabled={busy || !title.trim()}>{busy ? "생성 중..." : "만들기"}</button></div>
        </div>
      </form>
    </div>
  );
}
