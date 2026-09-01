import type { ContiFormState, ContiRow } from "./types";

function totalMinutes(rows: ContiRow[]) {
  return rows.reduce((sum, row) => sum + (Number(row.duration.match(/\d+/)?.[0]) || 0), 0);
}

export default function ContiSummaryBar({ title, form, rows }: { title: string; form: ContiFormState; rows: ContiRow[] }) {
  const space = form.locationItems.map((item) => item.spaces).filter(Boolean).join(", ") || rows.find((row) => row.location)?.location || "-";
  const people = form.mainPeople || rows.find((row) => row.personnel)?.personnel || "-";
  const items = [["촬영명", title || form.shootTitle || "-"], ["촬영 목적", form.purpose || "-"], ["주요 공간", space], ["주요 인물", people], ["총 예상시간", `${totalMinutes(rows)}분`]];
  return <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, border: "1px solid rgba(21,88,85,.14)", borderRadius: 8, background: "rgba(255,255,255,.72)" }}>{items.map(([label, value]) => <div key={label} style={{ minWidth: label === "촬영명" ? 180 : 110, flex: label === "촬영 목적" ? "1 1 220px" : undefined }}><span style={{ marginRight: 6, color: "#7b9691", fontSize: 11, fontWeight: 800 }}>{label}</span><strong style={{ color: "#155855", fontSize: 12 }}>{value}</strong></div>)}</div>;
}
