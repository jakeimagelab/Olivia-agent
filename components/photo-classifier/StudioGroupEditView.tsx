"use client";

import type { ReactNode } from "react";
import { Btn, C, Card, SectionPill } from "./PhotoSortingUi";

type StudioEditFile = {
  name: string;
  thumbUrl: string | null;
};

export type StudioEditGroup = {
  id: string;
  kind: "concept" | "person";
  editedFolderName: string;
  files: StudioEditFile[];
  poseType?: string;
  confidence?: number;
  sampleThumb?: string | null;
  tags?: string[];
  index?: number;
};

export function StudioGroupEditView({
  description,
  groupHeading,
  groupCountUnit,
  groups,
  etcFiles,
  onFolderNameChange,
  onBack,
  onApprove,
}: {
  description: ReactNode;
  groupHeading: string;
  groupCountUnit: "개" | "명";
  groups: StudioEditGroup[];
  etcFiles: StudioEditFile[];
  onFolderNameChange: (groupId: string, value: string) => void;
  onBack: () => void;
  onApprove: () => void;
}) {
  const totalFiles = groups.reduce((sum, group) => sum + group.files.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <div
        style={{
          padding: 14,
          background: "#F5F0FF",
          borderRadius: 10,
          fontSize: 12,
          color: C.purple,
          border: "1px solid #DDD6FE",
        }}
      >
        {description}
      </div>

      {etcFiles.length > 0 ? <StudioEtcGroupCard files={etcFiles} /> : null}

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
          {groupHeading} — {groups.length}{groupCountUnit} / {totalFiles}장
        </div>
        <div style={{ padding: "8px 0" }}>
          {groups.map((group, listIndex) => (
            <div
              key={group.id}
              style={{
                borderBottom: listIndex < groups.length - 1 ? `1px solid ${C.border}` : "none",
                padding: "12px 20px",
              }}
            >
              {group.kind === "person" ? (
                <PersonGroupEditRow
                  group={group}
                  onFolderNameChange={onFolderNameChange}
                />
              ) : (
                <ConceptGroupEditRow
                  group={group}
                  onFolderNameChange={onFolderNameChange}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      <div className="ps-btn-row">
        <Btn variant="secondary" onClick={onBack}>← 처음으로</Btn>
        <Btn style={{ background: C.purple }} onClick={onApprove}>승인</Btn>
      </div>
    </div>
  );
}

function StudioEtcGroupCard({ files }: { files: StudioEditFile[] }) {
  return (
    <Card>
      <div
        style={{
          padding: "12px 18px",
          background: "#FEF2F2",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>00_ETC_조명불량</span>
        <span
          style={{
            fontSize: 11,
            color: C.red,
            background: "#FEE2E2",
            padding: "2px 8px",
            borderRadius: 20,
          }}
        >
          {files.length}장
        </span>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "10px 18px", overflowX: "auto" }}>
        {files.slice(0, 8).map((file) => (
          <Thumbnail key={file.name} file={file} width={52} height={38} radius={4} />
        ))}
      </div>
    </Card>
  );
}

function ConceptGroupEditRow({
  group,
  onFolderNameChange,
}: {
  group: StudioEditGroup;
  onFolderNameChange: (groupId: string, value: string) => void;
}) {
  return (
    <div
      className="pc-mobile-form-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "100px 60px 1fr auto",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {group.files.slice(0, 4).map((file) => (
          <Thumbnail key={file.name} file={file} width={22} height={16} radius={2} />
        ))}
      </div>
      <SectionPill
        label={group.poseType ?? "Unknown"}
        count={group.files.length}
        color={group.poseType === "Standing" ? C.teal : C.orange}
      />
      <FolderNameInput group={group} onFolderNameChange={onFolderNameChange} />
      <span
        style={{
          fontSize: 9,
          background: C.light,
          color: C.teal,
          padding: "2px 6px",
          borderRadius: 4,
          whiteSpace: "nowrap",
        }}
      >
        신뢰도 {Math.round((group.confidence ?? 0) * 100)}%
      </span>
    </div>
  );
}

function PersonGroupEditRow({
  group,
  onFolderNameChange,
}: {
  group: StudioEditGroup;
  onFolderNameChange: (groupId: string, value: string) => void;
}) {
  return (
    <div
      className="pc-mobile-form-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "56px auto 1fr 44px",
        gap: 12,
        alignItems: "center",
      }}
    >
      {group.sampleThumb ? (
        <img
          src={group.sampleThumb}
          style={{ width: 44, height: 56, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}` }}
          alt=""
        />
      ) : (
        <div style={{ width: 44, height: 56, background: C.border, borderRadius: 6 }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(group.tags ?? []).map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 9,
                background: C.light,
                color: C.teal,
                padding: "2px 6px",
                borderRadius: 4,
                whiteSpace: "nowrap",
              }}
            >
              {tag}
            </span>
          ))}
          <span style={{ fontSize: 9, background: "rgba(232,93,44,.10)", color: "#FFC3AD", padding: "2px 6px", borderRadius: 4 }}>
            {group.files.length}장
          </span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {group.files.slice(0, 4).map((file) => (
            <Thumbnail key={file.name} file={file} width={22} height={16} radius={2} />
          ))}
        </div>
      </div>
      <FolderNameInput group={group} onFolderNameChange={onFolderNameChange} />
      <span style={{ fontSize: 9, background: C.light, color: C.muted, padding: "2px 6px", borderRadius: 4, textAlign: "center" }}>
        {group.index}번
      </span>
    </div>
  );
}

function FolderNameInput({
  group,
  onFolderNameChange,
}: {
  group: StudioEditGroup;
  onFolderNameChange: (groupId: string, value: string) => void;
}) {
  return (
    <input
      value={group.editedFolderName}
      onChange={(event) => onFolderNameChange(group.id, event.target.value)}
      style={{
        height: 34,
        border: `1.5px solid ${C.border}`,
        borderRadius: 8,
        padding: "0 10px",
        fontSize: 12,
        fontFamily: "inherit",
        outline: "none",
      }}
    />
  );
}

function Thumbnail({
  file,
  width,
  height,
  radius,
}: {
  file: StudioEditFile;
  width: number;
  height: number;
  radius: number;
}) {
  return file.thumbUrl ? (
    <img
      src={file.thumbUrl}
      style={{ width, height, objectFit: "cover", borderRadius: radius, flexShrink: 0 }}
      alt=""
    />
  ) : (
    <div style={{ width, height, background: C.border, borderRadius: radius, flexShrink: 0 }} />
  );
}
