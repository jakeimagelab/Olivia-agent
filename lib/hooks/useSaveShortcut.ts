"use client";

import { useEffect, useRef } from "react";

/**
 * Cmd/Ctrl+S를 가로채 브라우저의 "페이지 저장" 대신 onSave를 실행한다.
 * onSave는 매 렌더마다 새 함수를 넘겨도 안전하다 (ref로 최신 값만 참조).
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean = true) {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const isSaveCombo = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s";
      if (!isSaveCombo) return;
      e.preventDefault();
      onSaveRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}
