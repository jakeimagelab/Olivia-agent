"use client";

import { useEffect, useState } from "react";
import PortraitConsentPanel from "@/components/portrait-consent/PortraitConsentPanel";

export interface PortraitConsentAppProps {
  clientId?: string;
  workflowRunId?: string;
  embedded?: boolean;
  scopeToContext?: boolean;
}

export default function PortraitConsentApp({
  clientId,
  workflowRunId,
  embedded = false,
  scopeToContext = embedded,
}: PortraitConsentAppProps) {
  const [hospitalName, setHospitalName] = useState("");

  useEffect(() => {
    if (!clientId) { setHospitalName(""); return; }
    fetch(`/api/clients/${encodeURIComponent(clientId)}`)
      .then((response) => response.json())
      .then((data) => { if (data.ok && data.client) setHospitalName(data.client.hospital_name || data.client.name || ""); })
      .catch((error) => { console.error("[OLIVIA] Suppressed promise rejection", error); });
  }, [clientId]);

  return (
    <div style={{ minHeight: "100%", height: "100%", background: "#F4F1EB", padding: embedded ? 0 : "24px clamp(16px, 3vw, 36px) 60px" }}>
      <div style={{ width: "100%", maxWidth: embedded ? "none" : 1280, margin: "0 auto", overflow: "hidden", borderRadius: embedded ? 0 : 16 }}>
        <PortraitConsentPanel
          clientId={clientId ?? null}
          workflowRunId={workflowRunId ?? null}
          hospitalName={hospitalName}
          scopeToContext={scopeToContext}
        />
      </div>
    </div>
  );
}
