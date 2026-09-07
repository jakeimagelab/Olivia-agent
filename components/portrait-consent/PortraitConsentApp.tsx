"use client";

import { useEffect, useState } from "react";
import PortraitConsentPanel from "@/components/portrait-consent/PortraitConsentPanel";

export interface PortraitConsentAppProps {
  clientId?: string;
  workflowRunId?: string;
}

export default function PortraitConsentApp({ clientId, workflowRunId }: PortraitConsentAppProps) {
  const [hospitalName, setHospitalName] = useState("");

  useEffect(() => {
    if (!clientId) { setHospitalName(""); return; }
    fetch(`/api/clients/${encodeURIComponent(clientId)}`)
      .then((response) => response.json())
      .then((data) => { if (data.ok && data.client) setHospitalName(data.client.hospital_name || data.client.name || ""); })
      .catch(() => {});
  }, [clientId]);

  return (
    <div style={{ minHeight: "100%", background: "#F4F1EB", padding: "24px clamp(16px, 3vw, 36px) 60px" }}>
      <div style={{ width: "100%", maxWidth: 1100, margin: "0 auto" }}>
        <PortraitConsentPanel clientId={clientId ?? null} workflowRunId={workflowRunId ?? null} hospitalName={hospitalName} />
      </div>
    </div>
  );
}
