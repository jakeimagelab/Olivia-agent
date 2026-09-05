"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number | string;
};

// OLIVIA OS Desktop UI 제안서 3단계 — 기존 .pcrm-dialog-backdrop(전역 CSS, QuoteBuilder 등의
// 확인창)과 같은 골격(고정 inset, 어둡게 dim, 중앙 정렬)을 컴포넌트로 옮긴 것. 기존 클래스는
// 그대로 두고(이미 여러 화면이 쓰고 있어 건드리지 않음), 새 화면은 이 컴포넌트를 쓴다.
export default function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center",
        overflowY: "auto", padding: 24, background: "rgba(13, 37, 35, .5)",
      }}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div style={{
        width: `min(${typeof width === "number" ? `${width}px` : width}, 100%)`,
        maxHeight: "calc(100vh - 48px)", overflowY: "auto", borderRadius: 16, padding: 24,
        background: "var(--panel-bg)", boxShadow: "0 24px 80px rgba(13, 37, 35, .25)",
      }}>
        {title ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--muted)", padding: 4 }}
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body
  );
}
