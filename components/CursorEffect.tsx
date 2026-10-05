"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const NATIVE_CURSOR_SELECTOR = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='true']",
  "canvas",
  "[draggable='true']",
].join(",");

function needsNativeCursor(cursor: string) {
  return !["auto", "default", "pointer", "none"].includes(cursor);
}

export default function CursorEffect() {
  const pathname = usePathname();
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorTargetRef = useRef<Element | null>(null);
  const [clicking, setClicking] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // 터치 디바이스(모바일/태블릿)에서는 커서 효과 없음
    if (!window.matchMedia("(pointer: fine)").matches) {
      setIsTouch(true);
      return;
    }
    setIsTouch(false);
    if (pathname?.startsWith("/client-portal")) return;
    const cursor = cursorRef.current;
    if (!cursor) return;

    document.documentElement.classList.add("pc-custom-cursor-active");

    const updateCursorMode = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;

      // The global class hides every cursor with !important. Briefly turn it off
      // only while reading the element's original cursor, so canvas/dnd/resize
      // affordances keep their native system cursor instead of the orange ring.
      document.documentElement.classList.remove("pc-custom-cursor-active");
      const nativeCursor = window.getComputedStyle(target).cursor;
      document.documentElement.classList.add("pc-custom-cursor-active");

      const shouldKeepNative = Boolean(target.closest(NATIVE_CURSOR_SELECTOR)) || needsNativeCursor(nativeCursor);
      document.documentElement.classList.toggle("pc-custom-cursor-suspended", shouldKeepNative);
      if (shouldKeepNative) document.documentElement.style.setProperty("--pc-native-cursor", nativeCursor);
      else document.documentElement.style.removeProperty("--pc-native-cursor");
      setHidden(shouldKeepNative);
    };

    const onMove = (e: MouseEvent) => {
      cursor.style.transform = `translate3d(${e.clientX - 9}px, ${e.clientY - 9}px, 0)`;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target !== cursorTargetRef.current) {
        cursorTargetRef.current = target;
        updateCursorMode(target);
      }
    };
    const onLeave = () => setHidden(true);
    const onEnter = () => {
      cursorTargetRef.current = null;
      setHidden(false);
    };
    const onDown = () => setClicking(true);
    const onUp   = () => setClicking(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup",   onUp);

    return () => {
      document.documentElement.classList.remove("pc-custom-cursor-active");
      document.documentElement.classList.remove("pc-custom-cursor-suspended");
      document.documentElement.style.removeProperty("--pc-native-cursor");
      cursorTargetRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup",   onUp);
    };
  }, [pathname]);

  if (isTouch || pathname?.startsWith("/client-portal")) return null;

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      style={{
        position: "fixed", top: 0, left: 0,
        width: 18, height: 18,
        border: `2px solid ${clicking ? "#C94A1E" : "#E85D2C"}`,
        borderRadius: "50%",
        opacity: hidden ? 0 : 1,
        transform: "translate3d(-24px, -24px, 0)",
        pointerEvents: "none",
        zIndex: 100000,
        transition: "border-color 120ms ease, opacity 120ms ease, width 120ms ease, height 120ms ease",
        willChange: "transform",
      }}
    />
  );
}
