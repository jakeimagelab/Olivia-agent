"use client";

import { useState } from "react";

export default function OliviaActionCard({ action, onChanged }: { action: any; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const call = async (name: "approve" | "run" | "dismiss") => {
    setBusy(true);
    try {
      const response = await fetch(`/api/olivia/actions/${action.id}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error((await response.json()).error || "처리 실패");
      onChanged?.();
    } finally { setBusy(false); }
  };
  return (
    <article className="olivia-action-card">
      <div><span>{action.permission_level === "auto" ? "내부 자동" : action.permission_level === "owner_only" ? "대표 확인" : "승인 필요"}</span><b>{action.status}</b></div>
      <h3>{action.title}</h3><p>{action.description}</p>
      <div className="olivia-card-actions">
        {action.status === "waiting_approval" && <button disabled={busy} onClick={() => call("approve")}>승인</button>}
        {action.status === "approved" && <button disabled={busy} className="is-primary" onClick={() => call("run")}>승인하고 실행</button>}
        {!["completed", "dismissed"].includes(action.status) && <button disabled={busy} onClick={() => call("dismiss")}>무시</button>}
      </div>
    </article>
  );
}
