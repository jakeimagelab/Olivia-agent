import type { Segment, YoutubeEditingProject } from "./types";

export function exportProjectJson(project: YoutubeEditingProject, segments: Segment[]) {
  const payload = { project, segments };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${project.title || "youtube-editing"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string, string>)[ch]));
}

// 1차 버전은 정식 PDF 생성 대신 브라우저 인쇄를 사용한다(스펙에서도 이 방식을 우선 허용).
// 손글씨 캔버스 이미지는 세그먼트마다 오프스크린 렌더링이 필요해 범위를 넘어서므로
// 문장/카메라/자막/자료/효과음/전환/템플릿/메모까지만 인쇄 요약에 포함한다.
export function printProjectSummary(project: YoutubeEditingProject, segments: Segment[]) {
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
}
