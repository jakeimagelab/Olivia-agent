"use client";

import { useEffect } from "react";
import { OliviaErrorView } from "@/components/errors/OliviaErrorView";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logOliviaError("route", error, { pathname: window.location.pathname });
  }, [error]);

  return (
    <OliviaErrorView
      error={error}
      title="이 화면에서 오류가 발생했습니다."
      description="다른 기능은 그대로 유지됩니다. 오류 원문을 확인하거나 이 화면을 다시 불러오세요."
      location={typeof window === "undefined" ? "route" : window.location.pathname}
      onRetry={reset}
      onGoHome={() => { window.location.href = "/"; }}
    />
  );
}
