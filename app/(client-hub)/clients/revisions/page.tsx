"use client";

import { useCallback, useEffect, useState } from "react";
import PcrmRevisionTable from "../_components/PcrmRevisionTable";

export default function ClientRevisionsPage() {
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/client-portal/revisions", { cache: "no-store" });
      const d = await res.json();
      if (d.ok) setRevisions(d.revisions || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onUpdate = async (id: string, patch: { status?: string; adminReply?: string }) => {
    try {
      const res = await fetch("/api/admin/client-portal/revisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error || "저장 실패");
      await load();
    } catch (error) {
      alert(error instanceof Error ? error.message : "저장 실패");
    }
  };

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
      <PcrmRevisionTable revisions={revisions} loading={loading} onUpdate={onUpdate} />
    </div>
  );
}
