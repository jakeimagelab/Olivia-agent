"use client";

import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import styles from "./LegacyRouteWindowContent.module.css";

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
  if (!href) return <div className={styles.empty}>열 수 있는 화면 정보가 없습니다.</div>;

  return (
    <iframe
      key={href}
      className={styles.frame}
      src={embeddedHref(href)}
      title="포토클리닉 기능"
      allow="clipboard-read; clipboard-write; microphone; camera"
    />
  );
}
