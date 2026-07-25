"use client";

import { useEffect, useState } from "react";
import PcrmDocumentTable from "../_components/PcrmDocumentTable";
import type { WorkflowArtifact } from "@/lib/workflowArtifacts";

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState<(WorkflowArtifact & { hospital_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workflow-artifacts", { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.ok) setDocuments(d.artifacts || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
      <PcrmDocumentTable documents={documents} loading={loading} />
    </div>
  );
}
