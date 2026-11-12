"use client";

import { C, Card } from "./PhotoSortingUi";

export type PhotoShootingMode = "field" | "studio";

const SHOOTING_MODE_OPTIONS: ReadonlyArray<{
  mode: PhotoShootingMode;
  title: string;
  description: string;
}> = [
  {
    mode: "field",
    title: "병원 현장촬영",
    description: "사람·장비·장소·시간 변화로 Scene을 분류합니다.",
  },
  {
    mode: "studio",
    title: "스튜디오 프로필촬영",
    description: "의상·포즈·조명 기준으로 분류합니다.",
  },
];

export function PhotoShootingModeControl({
  mode,
  onChange,
}: {
  mode: PhotoShootingMode;
  onChange: (mode: PhotoShootingMode) => void;
}) {
  return (
    <Card>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12,
          fontWeight: 600,
          color: C.teal,
        }}
      >
        촬영 모드
      </div>
      <div
        className="pc-mobile-form-grid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}
      >
        {SHOOTING_MODE_OPTIONS.map((option) => {
          const selected = mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onChange(option.mode)}
              aria-pressed={selected}
              style={{
                padding: "16px 20px",
                textAlign: "left",
                border: "none",
                borderRight: option.mode === "field" ? `1px solid ${C.border}` : "none",
                background: selected ? C.light : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: selected ? C.teal : C.muted,
                  marginBottom: 4,
                }}
              >
                {option.title}
                {selected && " ✓"}
              </div>
              <div style={{ fontSize: 11, color: C.hint, lineHeight: 1.6 }}>
                {option.description}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
