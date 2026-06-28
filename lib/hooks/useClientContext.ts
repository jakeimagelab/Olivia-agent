"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ClientContext } from "@/lib/clientContext";

export function useClientContext() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("clientId") || searchParams.get("client_id") || "";
  const workflowRunId = searchParams.get("workflowRunId") || "";
  const stepKey = searchParams.get("stepKey") || "";
  const [clientContext, setClientContext] = useState<ClientContext | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(clientId));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientId) {
      setClientContext(null);
      setIsLoading(false);
      return;
    }
    let alive = true;
    setIsLoading(true);
    setError("");
    const qs = workflowRunId ? `?workflowRunId=${encodeURIComponent(workflowRunId)}` : "";
    fetch(`/api/clients/${clientId}/context${qs}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return;
        if (!data.ok) throw new Error(data.error || "고객정보를 불러오지 못했습니다.");
        setClientContext({ ...data.client, ...data.workflow, stepKey: stepKey || data.workflow?.currentStepKey });
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setIsLoading(false));
    return () => { alive = false; };
  }, [clientId, workflowRunId, stepKey]);

  return {
    clientContext,
    isClientLinked: Boolean(clientId),
    isLoading,
    error,
  };
}
