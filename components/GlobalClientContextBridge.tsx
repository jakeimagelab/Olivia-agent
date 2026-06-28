"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import ClientContextBanner from "@/components/ClientContextBanner";
import { useClientContext } from "@/lib/hooks/useClientContext";

function ClientContextBridgeInner() {
  const pathname = usePathname();
  const { clientContext, isClientLinked, isLoading, error } = useClientContext();

  useEffect(() => {
    if (!clientContext?.clientId) return;
    window.dispatchEvent(new CustomEvent("olivia-client-context", { detail: clientContext }));
  }, [clientContext]);

  if (!isClientLinked) return null;
  if (pathname?.startsWith("/clients") || pathname?.startsWith("/client-portal")) return null;

  return (
    <div style={{ padding: "14px 20px 0", background: "transparent" }}>
      <ClientContextBanner context={clientContext} isLoading={isLoading} error={error} />
    </div>
  );
}

export default function GlobalClientContextBridge() {
  return (
    <Suspense fallback={null}>
      <ClientContextBridgeInner />
    </Suspense>
  );
}
