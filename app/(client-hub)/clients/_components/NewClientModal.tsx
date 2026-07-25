"use client";

import { createPortal } from "react-dom";
import ConsultMeetingForm from "./ConsultMeetingForm";
import { C } from "@/lib/theme";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (clientId: string) => void;
};

export default function NewClientModal({ open, onClose, onCreated }: Props) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,.45)", overflowY: "auto" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ minHeight: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px 60px" }}>
        <div style={{ background: C.bg, borderRadius: 20, width: "100%", maxWidth: 600, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.orange, letterSpacing: ".1em", marginBottom: 4 }}>PCRM · CLIENT</div>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 900, color: C.teal }}>신규 고객 등록</h2>
              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>고객 저장 후 상세 화면에서 프로젝트를 생성할 수 있습니다.</p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: 8, background: C.white, cursor: "pointer", fontSize: 18, color: C.muted, fontFamily: "inherit", flexShrink: 0 }}>×</button>
          </div>
          <ConsultMeetingForm onCancel={onClose} onSuccess={onCreated} />
        </div>
      </div>
    </div>,
    document.body
  );
}
