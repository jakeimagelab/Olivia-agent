"use client";

import { Btn, C, Card } from "./PhotoSortingUi";

export type StudioClassificationCompleteStat = {
  label: string;
  value: number;
  color: string;
};

export function StudioClassificationCompleteView({
  stats,
  rootFolderName,
  groupDescription,
  downloadLabel,
  onDownload,
  onReset,
}: {
  stats: StudioClassificationCompleteStat[];
  rootFolderName: string;
  groupDescription: string;
  downloadLabel: string;
  onDownload: () => void;
  onReset: () => void;
}) {
  return (
    <Card style={{ maxWidth: 600 }}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 12,
          fontWeight: 600,
          color: C.purple,
        }}
      >
        ✅ 스튜디오 분류 완료!
      </div>
      <div style={{ padding: 20 }}>
        <div
          className="pc-mobile-form-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}
        >
          {stats.map(({ label, value, color }) => (
            <div key={label} style={{ background: C.bg, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 600, color }}>{value}</div>
              <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            background: C.light,
            borderRadius: 10,
            padding: 14,
            fontSize: 11,
            color: C.muted,
            marginBottom: 16,
            lineHeight: 1.9,
          }}
        >
          📁 <strong style={{ color: C.teal }}>분류_{rootFolderName}/</strong> — {groupDescription} 하위 폴더에 JPG 정리
          <br />
          📊 <strong style={{ color: C.teal }}>AI_SELECT_REPORT/</strong> — 3종 CSV + summary.json
        </div>
        <div className="ps-btn-row">
          <Btn variant="secondary" onClick={onDownload}>{downloadLabel}</Btn>
          <Btn onClick={onReset}>처음으로</Btn>
        </div>
      </div>
    </Card>
  );
}
