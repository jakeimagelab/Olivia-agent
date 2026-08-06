"use client";

import { Check, Info, X } from "lucide-react";
import { C, R } from "@/lib/theme";
import { DOCTOR_POSE_OPTIONS } from "@/lib/youtube-editing/constants";
import type { DoctorPoseKey } from "@/lib/youtube-editing/types";
import DoctorPoseIcon from "./DoctorPoseIcon";

export default function DoctorPosePopup({
  open,
  onClose,
  onSelect,
  selectedPoseKey,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (poseKey: DoctorPoseKey) => void;
  selectedPoseKey?: DoctorPoseKey | null;
}) {
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
      <div
        style={{
          position: "absolute", bottom: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
          zIndex: 91, background: "#fff", border: `1px solid ${C.border}`, borderRadius: R.lg,
          boxShadow: "0 16px 40px rgba(21,88,85,.18)", padding: 16, width: "min(680px, 94vw)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong style={{ fontSize: 14, color: C.ink }}>원장 포즈 선택</strong>
            <Info size={12} color={C.hint} />
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer" }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
          {DOCTOR_POSE_OPTIONS.map(({ key, label }) => {
            const active = key === selectedPoseKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(key)}
                style={{
                  flexShrink: 0, width: 96, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "10px 6px", borderRadius: R.md, cursor: "pointer", position: "relative",
                  border: `1.5px solid ${active ? "#22876A" : C.border}`, background: active ? "#EAF7F1" : "#fff",
                }}
              >
                {active ? (
                  <span style={{
                    position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%",
                    background: "#22876A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={10} />
                  </span>
                ) : null}
                <DoctorPoseIcon poseKey={key} size={44} />
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.ink }}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
