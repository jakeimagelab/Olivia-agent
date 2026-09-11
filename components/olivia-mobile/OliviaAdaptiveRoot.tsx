"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { shouldUseOliviaMobileSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import styles from "./OliviaAdaptiveRoot.module.css";

const OliviaDesktop = dynamic(() => import("@/components/olivia-os/OliviaDesktop"), {
  loading: () => <SurfaceLoading />,
});
const OliviaMobileShell = dynamic(() => import("./OliviaMobileShell"), {
  ssr: false,
  loading: () => <SurfaceLoading />,
});

type Surface = "mobile" | "desktop" | null;

function SurfaceLoading() {
  return <main className={styles.loading} aria-label="Olivia를 여는 중"><span /></main>;
}

function readSurface(): Exclude<Surface, null> {
  const forceMobilePreview = process.env.NODE_ENV !== "production"
    && new URLSearchParams(window.location.search).get("mobilePreview") === "1";
  return shouldUseOliviaMobileSurface({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    forceMobilePreview,
  }) ? "mobile" : "desktop";
}

export default function OliviaAdaptiveRoot() {
  const [surface, setSurface] = useState<Surface>(null);

  useEffect(() => {
    const viewportQuery = window.matchMedia("(max-width: 820px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setSurface(readSurface());
    update();
    viewportQuery.addEventListener("change", update);
    coarseQuery.addEventListener("change", update);
    window.addEventListener("resize", update, { passive: true });
    return () => {
      viewportQuery.removeEventListener("change", update);
      coarseQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("olivia-mobile-os", surface === "mobile");
    return () => document.documentElement.classList.remove("olivia-mobile-os");
  }, [surface]);

  if (!surface) return <SurfaceLoading />;
  return surface === "mobile" ? <OliviaMobileShell /> : <OliviaDesktop />;
}
