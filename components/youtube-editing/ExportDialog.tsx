"use client";

import { FileJson, Printer, X } from "lucide-react";
import { C, R } from "@/lib/theme";
import type { Segment, YoutubeEditingProject } from "@/lib/youtube-editing/types";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]));
}

const btnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, height: 42, borderRadius: R.md,
  border: `1px solid ${C.border}`, background: "#fff", color: C.ink, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 14px",
};

export default function ExportDialog({
  open,
  onClose,
  project,
  segments,
}: {
  open: boolean;
  onClose: () => void;
  project: YoutubeEditingProject;
  segments: Segment[];
}) {
  if (!open) return null;

  const exportJson = () => {
    const payload = { project, segments };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "youtube-editing"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 1차 버전은 정식 PDF 대신 브라우저 인쇄를 사용한다(스펙에서도 이 방식을 우선 허용).
  // 손글씨 캔버스 이미지는 세그먼트마다 오프스크린 렌더링이 필요해 범위를 넘어서므로
  // 문장/카메라/자막/자료/효과음/전환/템플릿/메모까지만 인쇄 요약에 포함한다.
  const printView = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = segments.map((s, i) => `
      <section style="page-break-inside:avoid;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #ddd;">
        <div style="font-size:11px;color:#888;">${String(i + 1).padStart(2, "0")} / ${segments.length} · 약 ${s.estimatedDurationSec ?? "-"}초</div>
        <div style="font-size:15px;font-weight:700;margin:4px 0 8px;">${escapeHtml(s.scriptText)}</div>
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tr><td style="padding:3px 6px;color:#666;width:90px;">카메라</td><td style="padding:3px 6px;">${s.camera.join(", ") || "-"}</td></tr>
          <tr><td style="padding:3px 6px;color:#666;">자막</td><td style="padding:3px 6px;">${s.caption.type}${s.caption.text ? ` — ${escapeHtml(s.caption.text)}` : ""}</td></tr>
          <tr><td style="padding:3px 6px;color:#666;">자료/화면</td><td style="padding:3px 6px;">${s.visual.enabled ? `${s.visual.type} (${s.visual.style})` : "없음"}${s.visual.description ? ` — ${escapeHtml(s.visual.description)}` : ""}</td></tr>
          <tr><td style="padding:3px 6px;color:#666;">효과음</td><td style="padding:3px 6px;">${s.soundEffect}</td></tr>
          <tr><td style="padding:3px 6px;color:#666;">전환</td><td style="padding:3px 6px;">${s.transition}</td></tr>
          <tr><td style="padding:3px 6px;color:#666;">템플릿</td><td style="padding:3px 6px;">${s.template}</td></tr>
          ${s.editingNote ? `<tr><td style="padding:3px 6px;color:#666;">메모</td><td style="padding:3px 6px;">${escapeHtml(s.editingNote)}</td></tr>` : ""}
        </table>
      </section>
    `).join("");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(project.title)}</title>
      <style>body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;padding:24px;color:#1c2b28;}</style>
      </head><body><h1 style="font-size:18px;">${escapeHtml(project.title)}</h1>${rows}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(28,43,40,.35)", display: "grid", placeItems: "center" }} onClick={onClose}>
      <div className="pc-card pc-card--padded" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <strong style={{ fontSize: 15, color: C.ink }}>내보내기</strong>
          <button type="button" onClick={onClose} style={{ border: 0, background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" onClick={exportJson} style={btnStyle}><FileJson size={15} />JSON 내보내기</button>
          <button type="button" onClick={printView} style={btnStyle}><Printer size={15} />인쇄용 PDF (브라우저 인쇄)</button>
        </div>
      </div>
    </div>
  );
}
