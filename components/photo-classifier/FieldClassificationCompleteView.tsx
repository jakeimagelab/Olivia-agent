"use client";

import { Btn, C } from "./PhotoSortingUi";

export type FieldClassificationCompleteStat = {
  label: string;
  value: number;
  color: string;
};

export function FieldClassificationCompleteView({
  stats,
  onReview,
  onOpenPhotoSelect,
}: {
  stats: FieldClassificationCompleteStat[];
  onReview: () => void;
  onOpenPhotoSelect?: () => void;
}) {
  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: C.green }}>사진 분류 완료</div>
      <div
        className="pc-mobile-form-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}
      >
        {stats.map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: C.surface,
              borderRadius: 10,
              border: `1px solid ${C.border}`,
              padding: "12px 16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
            <div style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: C.light,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "14px 16px",
          fontSize: 12,
          color: C.muted,
          lineHeight: 1.7,
        }}
      >
        Scene 폴더 정리가 완료되었습니다. 사용할 JPG 선택은 <strong style={{ color: C.teal }}>사진 셀렉</strong>에서,
        대응 RAW 처리는 <strong style={{ color: C.teal }}>RAW 매칭</strong>에서 이어서 진행합니다.
      </div>
      <div className="ps-btn-row">
        <Btn variant="secondary" onClick={onReview}>← 씬 검토</Btn>
        {onOpenPhotoSelect ? <Btn onClick={onOpenPhotoSelect}>사진 셀렉으로 이동</Btn> : null}
      </div>
    </div>
  );
}
