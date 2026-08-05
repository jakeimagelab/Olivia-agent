"use client";

import { Copy, FileText, Pen, Plus, Scissors, Trash2 } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { Segment } from "@/lib/youtube-editing/types";

function summarize(segments: Segment[]) {
  const total = segments.length || 1;
  const onCamera = segments.filter((s) => !s.camera.includes("원장 화면 미사용") && s.camera.length > 0).length;
  const withVisual = segments.filter((s) => s.visual.enabled).length;
  const effectCaptions = segments.filter((s) => s.caption.type === "효과 자막" || s.caption.type === "키워드 강조").length;
  const imageAssets = segments.filter((s) => s.visual.enabled && s.visual.type === "이미지 자료").length;
  return {
    onCameraPct: Math.round((onCamera / total) * 100),
    visualPct: Math.round((withVisual / total) * 100),
    effectCaptions,
    imageAssets,
  };
}

export default function ScriptPanel({
  segments,
  selectedId,
  onSelect,
  onAddSegment,
  onDeleteSegment,
  onMoveSegment,
  onDuplicateSegment,
  onSplitSegment,
  onMergeNext,
  hasAnnotation,
}: {
  segments: Segment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddSegment: (afterId?: string) => void;
  onDeleteSegment: (id: string) => void;
  onMoveSegment: (id: string, direction: "up" | "down") => void;
  onDuplicateSegment: (id: string) => void;
  onSplitSegment: (id: string) => void;
  onMergeNext: (id: string) => void;
  hasAnnotation: (id: string) => boolean;
}) {
  const stats = summarize(segments);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>전체 대본</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{segments.length}문장</div>
        </div>
        <button
          type="button"
          onClick={() => onAddSegment()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 10px",
            borderRadius: R.sm, border: `1px solid ${C.border}`, background: "#fff", color: C.teal, fontSize: 11.5, fontWeight: 800, cursor: "pointer",
          }}
        >
          <Plus size={13} />문장 추가
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingBottom: 8 }}>
        {segments.length === 0 ? (
          <p style={{ fontSize: 12, color: C.hint }}>등록된 문장이 없습니다.</p>
        ) : segments.map((segment, index) => {
          const active = segment.id === selectedId;
          return (
            <div
              key={segment.id}
              onClick={() => onSelect(segment.id)}
              style={{
                cursor: "pointer", borderRadius: R.md, padding: "10px 12px",
                border: `1.5px solid ${active ? "#2563EB" : C.border}`,
                background: active ? "#EEF3FF" : "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: active ? "#2563EB" : C.hint, flexShrink: 0, marginTop: 1 }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: C.ink, lineHeight: 1.5 }}>{segment.scriptText || "(빈 문장)"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, marginLeft: 22 }}>
                <span style={{ fontSize: 10, color: C.hint }}>~{segment.estimatedDurationSec ?? "-"}초</span>
                {segment.visual.enabled ? <FileText size={11} color={C.sage} /> : null}
                {hasAnnotation(segment.id) ? <Pen size={11} color={C.orange} /> : null}
              </div>
              {active ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8, marginLeft: 22 }} onClick={(e) => e.stopPropagation()}>
                  <IconAction label="위로" onClick={() => onMoveSegment(segment.id, "up")} disabled={index === 0}>↑</IconAction>
                  <IconAction label="아래로" onClick={() => onMoveSegment(segment.id, "down")} disabled={index === segments.length - 1}>↓</IconAction>
                  <IconAction label="복제" onClick={() => onDuplicateSegment(segment.id)}><Copy size={11} /></IconAction>
                  <IconAction label="문장 분리" onClick={() => onSplitSegment(segment.id)}><Scissors size={11} /></IconAction>
                  <IconAction label="다음 문장과 합치기" onClick={() => onMergeNext(segment.id)} disabled={index === segments.length - 1}>⤵</IconAction>
                  <IconAction label="삭제" onClick={() => onDeleteSegment(segment.id)} danger><Trash2 size={11} /></IconAction>
                </div>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onAddSegment(selectedId ?? undefined)}
          style={{
            marginTop: 4, height: 38, borderRadius: R.md, border: `1px dashed ${C.border}`,
            background: "transparent", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          + 새 문장 추가
        </button>
      </div>

      <div style={{ flexShrink: 0, marginTop: 10, padding: 12, borderRadius: R.md, background: C.mint, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.teal, marginBottom: 6 }}>요약 메모</div>
        <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
          원장 출연 화면 {stats.onCameraPct}%<br />
          자료화면 {stats.visualPct}%<br />
          효과 자막 {stats.effectCaptions}개<br />
          이미지 자료 {stats.imageAssets}개
        </p>
      </div>
    </div>
  );
}

function IconAction({ label, onClick, disabled, danger, children }: {
  label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 26, minWidth: 26, padding: "0 6px", borderRadius: 6, border: `1px solid ${C.border}`,
        background: "#fff", color: danger ? C.danger : C.muted, fontSize: 10.5, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
