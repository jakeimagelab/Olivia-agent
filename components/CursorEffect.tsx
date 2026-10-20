"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function CursorEffect() {
  const pathname = usePathname();

  useEffect(() => {
    // 터치 디바이스(모바일/태블릿)에서는 커서 효과 없음.
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (pathname?.startsWith("/client-portal")) return;

    const root = document.documentElement;
    root.classList.add("pc-custom-cursor-active");

    const onDown = () => root.classList.add("pc-custom-cursor-clicking");
    const onUp = () => root.classList.remove("pc-custom-cursor-clicking");

    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);

    return () => {
      root.classList.remove("pc-custom-cursor-active");
      root.classList.remove("pc-custom-cursor-clicking");
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [pathname]);

  return null;
}
