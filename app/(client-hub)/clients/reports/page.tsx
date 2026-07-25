"use client";

import { useEffect, useState } from "react";
import PcrmReportView from "../_components/PcrmReportView";

export default function ClientReportsPage() {
  const [summary, setSummary] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/pcrm/reports", { cache: "no-store" });
        const d = await res.json();
        if (!cancelled && d.ok) {
          setSummary(d.summary);
          setHospitals(d.hospitals || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ maxWidth: 1500, margin: "0 auto", padding: "0 0 80px" }}>
      <PcrmReportView summary={summary} hospitals={hospitals} loading={loading} />
    </div>
  );
}
