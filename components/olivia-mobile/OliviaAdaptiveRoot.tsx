"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { resolveOliviaSurface, type OliviaSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import styles from "./OliviaAdaptiveRoot.module.css";

const OliviaDesktop = dynamic(() => import("@/components/olivia-os/OliviaDesktop"), {
  loading: () => <SurfaceLoading />,
});
const OliviaMobileShell = dynamic(() => import("./OliviaMobileShell"), {
  ssr: false,
  loading: () => <SurfaceLoading />,
});
const OliviaTabletShell = dynamic(() => import("@/components/olivia-tablet/OliviaTabletShell"), {
  ssr: false,
  loading: () => <SurfaceLoading />,
});

function SurfaceLoading() {
  return <main className={styles.loading} aria-label="Olivia를 여는 중"><span /></main>;
}

function readSurface(): OliviaSurface {
  const params = new URLSearchParams(window.location.search);
  const previewEnabled = process.env.NODE_ENV !== "production";
  return resolveOliviaSurface({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    forceMobilePreview: previewEnabled && params.get("mobilePreview") === "1",
    forceTabletPreview: previewEnabled && params.get("tabletPreview") === "1",
  });
}

export default function OliviaAdaptiveRoot() {
  const [surface, setSurface] = useState<OliviaSurface | null>(null);

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
    document.documentElement.classList.toggle("olivia-tablet-os", surface === "tablet");
    return () => {
      document.documentElement.classList.remove("olivia-mobile-os");
      document.documentElement.classList.remove("olivia-tablet-os");
    };
  }, [surface]);

  if (!surface) return <SurfaceLoading />;
  if (surface === "mobile") return <OliviaMobileShell />;
  if (surface === "tablet") return <OliviaTabletShell />;
  return <OliviaDesktop />;
}
