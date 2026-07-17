"use client";
import { useEffect, useState } from "react";

export type PortalSession = {
  accessId: string;
  clientId: string;
  clientName: string;
  managerName: string;
  email: string;
  phone: string;
  workflowStatus: string;
  workflowRunId: string | null;
  currentStepKey: string;
  currentStepName: string;
  tokenExpiresAt: string | null;
};

export function usePortalSession() {
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("cp_token") : null;
    if (!token) { setError("링크를 통해 접근해주세요."); setLoading(false); return; }
    fetch("/api/client-portal/auth", { headers: { "x-portal-token": token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setSession(d.session); else setError(d.error ?? "인증 실패"); })
      .catch(() => setError("서버 연결 오류"))
      .finally(() => setLoading(false));
  }, []);

  const token = typeof window !== "undefined" ? localStorage.getItem("cp_token") ?? "" : "";

  return { session, loading, error, token };
}
