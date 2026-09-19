"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import styles from "./LegacyRouteWindowContent.module.css";

type FrameState = "loading" | "ready" | "failed";

const LOAD_TIMEOUT_MS = 15_000;

function embeddedHref(href: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}oliviaEmbedded=1`;
}

// Window 전용 Adapter가 아직 없는 기존 기능을 숨기거나 Desktop 밖으로 보내지 않는
// compatibility layer다. iframe의 viewport가 곧 AppWindow content 크기이므로 기존 페이지의
// 반응형 CSS도 실제 창 크기에 맞춰 동작한다. 전용 Adapter가 생기면 registry route 매핑이
// 우선하므로 이 경로를 자동으로 벗어난다.
export function LegacyRouteWindowContent({ context }: { context?: WindowContext }) {
  const href = context?.resourceType === "route" ? context.resourceId : undefined;
  const [state, setState] = useState<FrameState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!href) return;
    setState("loading");
    const timeout = window.setTimeout(() => setState("failed"), LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [attempt, href]);

  if (!href) return <div className={styles.empty}>열 수 있는 화면 정보가 없습니다.</div>;

  return (
    <div className={styles.shell} data-state={state}>
      <iframe
        key={`${href}:${attempt}`}
        className={styles.frame}
        src={embeddedHref(href)}
        title="포토클리닉 기능"
        allow="clipboard-read; clipboard-write; microphone; camera"
        onLoad={() => setState("ready")}
        onError={() => setState("failed")}
      />

      {state !== "ready" ? (
        <div className={styles.status} role={state === "failed" ? "alert" : "status"}>
          {state === "loading" ? (
            <>
              <LoaderCircle className={styles.spinner} size={24} aria-hidden="true" />
              <strong>화면을 불러오는 중입니다</strong>
              <span>기존 기능을 Olivia 창에 연결하고 있습니다.</span>
            </>
          ) : (
            <>
              <span className={styles.failureMark}>!</span>
              <strong>화면을 불러오지 못했습니다</strong>
              <span>연결 상태를 확인한 뒤 다시 시도해 주세요.</span>
              <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw size={14} aria-hidden="true" /> 다시 시도
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
