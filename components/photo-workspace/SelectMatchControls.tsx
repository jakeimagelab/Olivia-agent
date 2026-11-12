"use client";

import { BRIDGE_COLOR_LABELS, type BridgeColorLabel } from "@/lib/photo-bridge/labels";
import type { RawMatchCriteria } from "@/lib/photo-bridge/rawMatchDelivery";

export type SelectMatchFeature = "raw_match" | "find_move" | "seq_check" | "program_archive";

type SelectMatchControlColors = {
  surfaceCard: string;
  groupedSurface: string;
  inputSurface: string;
  uiBorder: string;
  uiText: string;
  uiMuted: string;
  uiHint: string;
  uiAccent: string;
};

export function SelectMatchFeatureTabs({
  embedded,
  feature,
  onChange,
  colors,
}: {
  embedded: boolean;
  feature: SelectMatchFeature;
  onChange: (feature: SelectMatchFeature) => void;
  colors: Pick<SelectMatchControlColors, "surfaceCard" | "groupedSurface" | "uiBorder" | "uiMuted" | "uiAccent">;
}) {
  if (embedded) return null;
  const items: Array<{ key: SelectMatchFeature; label: string; fontSize?: number }> = [
    { key: "raw_match", label: "셀렉 & RAW 매칭" },
    { key: "find_move", label: "파일명으로 찾기" },
    { key: "seq_check", label: "파일 순서 검토" },
    { key: "program_archive", label: "모바일 자동화 > 프로그램 아카이브", fontSize: 11 },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 20 }}>
      {items.map((item) => (
        <button key={item.key} onClick={() => onChange(item.key)} style={{
          padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
          border: `1.5px solid ${feature === item.key ? colors.uiAccent : colors.uiBorder}`,
          background: feature === item.key ? colors.groupedSurface : colors.surfaceCard,
          color: feature === item.key ? colors.uiAccent : colors.uiMuted,
          fontSize: item.fontSize ?? 12, fontWeight: 500,
        }}>{item.label}</button>
      ))}
    </div>
  );
}

export function RawMatchCriteriaPanel({
  visible,
  criteria,
  expectedCount,
  onChange,
  colors,
}: {
  visible: boolean;
  criteria: RawMatchCriteria;
  expectedCount: number;
  onChange: (criteria: RawMatchCriteria) => void;
  colors: Pick<SelectMatchControlColors, "groupedSurface" | "inputSurface" | "uiBorder" | "uiText" | "uiHint" | "uiMuted" | "uiAccent">;
}) {
  if (!visible) return null;
  const ratingEnabled = criteria.source !== "color";
  const colorEnabled = criteria.source !== "rating";
  return (
    <section aria-label="RAW 매칭 기준" style={{ background: colors.groupedSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <strong style={{ color: colors.uiText, fontSize: 12 }}>매칭 기준</strong>
        <div style={{ display: "inline-flex", border: `1px solid ${colors.uiBorder}`, borderRadius: 9, overflow: "hidden" }}>
          {([['rating', '별점'], ['color', '컬러'], ['both', '둘 다']] as const).map(([source, label]) => (
            <button
              key={source}
              type="button"
              aria-pressed={criteria.source === source}
              onClick={() => onChange({ ...criteria, source })}
              style={{ minHeight: 36, padding: "0 14px", border: 0, borderRight: source !== "both" ? `1px solid ${colors.uiBorder}` : 0, background: criteria.source === source ? colors.uiAccent : "transparent", color: criteria.source === source ? "#103E36" : colors.uiMuted, font: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
            >{label}</button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", color: colors.uiAccent, fontSize: 12, fontWeight: 600 }}>매칭할 사진 {expectedCount.toLocaleString("ko-KR")}장</span>
      </div>
      <div style={{ display: "grid", gap: 9 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, color: ratingEnabled ? colors.uiText : colors.uiHint, opacity: ratingEnabled ? 1 : .45 }}>
          <span style={{ width: 42, fontSize: 11, fontWeight: 600 }}>별점</span>
          <select
            value={criteria.minRating}
            disabled={!ratingEnabled}
            onChange={(event) => onChange({ ...criteria, minRating: Number(event.currentTarget.value) as RawMatchCriteria["minRating"] })}
            style={{ minHeight: 36, border: `1px solid ${colors.uiBorder}`, borderRadius: 8, background: colors.inputSurface, color: colors.uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
          >
            {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>★{rating} 이상</option>)}
          </select>
        </label>
        <div aria-disabled={!colorEnabled} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, color: colorEnabled ? colors.uiText : colors.uiHint, opacity: colorEnabled ? 1 : .45 }}>
          <span style={{ width: 42, fontSize: 11, fontWeight: 600 }}>컬러</span>
          {([6, 7, 8, 9] as BridgeColorLabel[]).map((label) => {
            const checked = criteria.colorLabels.includes(label);
            return (
              <label key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 36, cursor: colorEnabled ? "pointer" : "default", fontSize: 11 }}>
                <input
                  type="checkbox"
                  disabled={!colorEnabled}
                  checked={checked}
                  onChange={() => onChange({
                    ...criteria,
                    colorLabels: checked
                      ? criteria.colorLabels.filter((value) => value !== label)
                      : [...criteria.colorLabels, label].sort() as RawMatchCriteria["colorLabels"],
                  })}
                />
                <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: BRIDGE_COLOR_LABELS[label].color }} />
                {label}
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}
