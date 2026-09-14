"use client";

import { useState } from "react";
import styles from "./OliviaTabletShell.module.css";

function embeddedHref(href: string) {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}oliviaEmbedded=1`;
}

export default function TabletRouteFrame({ href, title }: { href: string; title: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={styles.routeFrame} aria-busy={!loaded}>
      {!loaded ? <div className={styles.routeFrameLoading}>{title} 준비 중…</div> : null}
      <iframe
        src={embeddedHref(href)}
        title={title}
        className={`${styles.routeFrameIframe} ${loaded ? styles.routeFrameLoaded : ""}`}
        onLoad={() => setLoaded(true)}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
