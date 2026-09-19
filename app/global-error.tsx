"use client";

import { useEffect } from "react";
import { OliviaErrorView } from "@/components/errors/OliviaErrorView";
import { logOliviaError } from "@/lib/errors/errorDiagnostics";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logOliviaError("root-layout", error, {
      pathname: typeof window === "undefined" ? "unknown" : window.location.pathname,
    });
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>
        <OliviaErrorView
          error={error}
          title="OLIVIA OS를 시작하지 못했습니다."
          description="루트 화면에서 오류가 발생했습니다. 오류 원문을 확인한 뒤 다시 시도해 주세요."
          location="root-layout"
          onRetry={reset}
          onGoHome={() => { window.location.href = "/"; }}
        />
      </body>
    </html>
  );
}
