"use client";
import { useEffect, useRef, useState } from "react";

export default function CursorEffect() {
  const dotRef = useRef<HTMLDivElement>(null);
  const [clicking, setClicking] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // 터치 디바이스(모바일/태블릿)에서는 커서 효과 없음
    if (window.matchMedia("(pointer: coarse)").matches) {
      setIsTouch(true);
      return;
    }
    const dot = dotRef.current;
    if (!dot) return;

    const onMove = (e: MouseEvent) => {
      dot.style.transform = `translate(${e.clientX - 4}px, ${e.clientY - 4}px)`;
    };
    const onDown = () => setClicking(true);
    const onUp   = () => setClicking(false);

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup",   onUp);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup",   onUp);
    };
  }, []);

  if (isTouch) return null;

  return (
    <div
      ref={dotRef}
      style={{
        position: "fixed", top: 0, left: 0,
        width: 8, height: 8,
        background: clicking ? "#155855" : "#E85D2C",
        borderRadius: "50%",
        pointerEvents: "none",
        zIndex: 100000,
        transition: "background 150ms",
        willChange: "transform",
      }}
    />
  );
}
