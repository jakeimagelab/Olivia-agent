"use client";

import { Btn, C, Card } from "./PhotoSortingUi";

type StudioConfirmationFile = {
  name: string;
  thumbUrl: string | null;
};

export type StudioConfirmationGroup = {
  id: string;
  tabLabel: string;
  editedFolderName: string;
  isEtc: boolean;
  files: StudioConfirmationFile[];
  tags: Array<{ label: string; tone?: "teal" | "orange" }>;
};

export type StudioConfirmationStat = {
  label: string;
  value: number;
  color: string;
};

export function StudioGroupConfirmationView({
  groups,
  activeIndex,
  stats,
  onActiveIndexChange,
  onBack,
  onStart,
}: {
  groups: StudioConfirmationGroup[];
  activeIndex: number;
  stats: StudioConfirmationStat[];
  onActiveIndexChange: (index: number) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const activeGroup = groups[activeIndex] ?? groups.find((group) => !group.isEtc);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {groups.map((group, index) => (
          <button
            key={group.id}
            type="button"
            onClick={() => onActiveIndexChange(index)}
            style={{
              padding: "6px 12px",
              borderRadius: 8,
              border: `1.5px solid ${index === activeIndex ? C.purple : C.border}`,
              background: index === activeIndex ? "rgba(124,58,237,.16)" : C.surface,
              fontSize: 11,
              fontWeight: 600,
              color: index === activeIndex ? C.purple : C.muted,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {group.isEtc ? "ETC" : group.tabLabel}
            <span style={{ marginLeft: 4, fontSize: 9, color: C.hint }}>{group.files.length}장</span>
          </button>
        ))}
      </div>

      <div className="ps-stat4">
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

      {activeGroup ? <StudioGroupPreview group={activeGroup} /> : null}

      <div className="ps-btn-row">
        <Btn variant="secondary" onClick={onBack}>← 그룹 수정</Btn>
        <Btn style={{ background: C.purple }} onClick={onStart}>파일 정리 시작</Btn>
      </div>
    </div>
  );
}

function StudioGroupPreview({ group }: { group: StudioConfirmationGroup }) {
  return (
    <Card>
      <div
        style={{
          padding: "12px 18px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: group.isEtc ? C.red : C.purple }}>
          {group.editedFolderName}
        </span>
        <span style={{ fontSize: 11, color: C.hint }}>{group.files.length}장</span>
        {!group.isEtc ? group.tags.map((tag) => (
          <span
            key={`${tag.tone ?? "teal"}-${tag.label}`}
            style={tag.tone === "orange"
              ? { fontSize: 10, background: "rgba(232,93,44,.10)", color: "#FFC3AD", padding: "2px 8px", borderRadius: 20 }
              : { fontSize: 10, background: C.light, color: C.teal, padding: "2px 8px", borderRadius: 20 }}
          >
            {tag.label}
          </span>
        )) : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 6, padding: 12 }}>
        {group.files.map((file) => (
          <div key={file.name} style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            {file.thumbUrl ? (
              <img
                src={file.thumbUrl}
                alt={file.name}
                style={{ width: "100%", aspectRatio: "3/2", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "3/2", background: C.border }} />
            )}
            <div
              style={{
                padding: "3px 6px",
                fontSize: 8,
                color: C.hint,
                fontFamily: "monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
