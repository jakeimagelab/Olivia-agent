"use client";

import { useEffect, useState } from "react";
import { resolveOliviaSurface } from "@/lib/olivia/mobile/adaptiveSurface";
import {
  useOliviaUiSurface,
  type OliviaUiSurface,
} from "@/lib/olivia/surfaceContext";

function readBrowserSurface(): OliviaUiSurface {
  return resolveOliviaSurface({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
  });
}

export function usePhotoSourceSurface(): OliviaUiSurface {
  const inheritedSurface = useOliviaUiSurface();
  const [surface, setSurface] = useState<OliviaUiSurface>(inheritedSurface);

  useEffect(() => {
    if (inheritedSurface !== "desktop") {
      setSurface(inheritedSurface);
      return;
    }

    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const update = () => setSurface(readBrowserSurface());
    update();
    window.addEventListener("resize", update, { passive: true });
    coarsePointer.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      coarsePointer.removeEventListener("change", update);
    };
  }, [inheritedSurface]);

  return surface;
}
