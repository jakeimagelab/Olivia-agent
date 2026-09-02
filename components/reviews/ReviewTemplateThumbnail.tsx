import type { ReviewStoryDocument } from "@/lib/reviewContent/storyDocument";

// 실제 썸네일 이미지 자산이 없는 템플릿(기본 10종 포함)을 위한 미니어처. layout_config에 저장된
// editorDocument의 element geometry를 그대로 축소 렌더링해, 항상 실제 레이아웃과 정확히
// 일치하는 미리보기를 별도 이미지 파이프라인 없이 보여준다.
export default function ReviewTemplateThumbnail({ document }: { document: ReviewStoryDocument }) {
  const sorted = [...document.elements].sort((a, b) => a.zIndex - b.zIndex);
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: document.background, overflow: "hidden" }}>
      {sorted.map((element) => {
        if (element.hidden) return null;
        const box: React.CSSProperties = {
          position: "absolute",
          left: pct(element.x, document.width),
          top: pct(element.y, document.height),
          width: pct(element.width, document.width),
          height: pct(element.height, document.height),
        };
        if (element.type === "image") {
          return <div key={element.id} style={{ ...box, background: "#D9E1DE", borderRadius: "6%" }} />;
        }
        if (element.type === "shape") {
          return <div key={element.id} style={{ ...box, background: element.fill, borderRadius: 2 }} />;
        }
        const lineCount = Math.max(1, Math.min(4, Math.round(element.height / (element.fontSize * element.lineHeight)) || 1));
        const widths = [100, 92, 78, 60];
        return (
          <div key={element.id} style={{ ...box, display: "flex", flexDirection: "column", justifyContent: "flex-start", gap: "6%", alignItems: element.textAlign === "center" ? "center" : element.textAlign === "right" ? "flex-end" : "flex-start" }}>
            {Array.from({ length: lineCount }).map((_, index) => (
              <span
                key={index}
                style={{
                  display: "block",
                  width: `${widths[index % widths.length]}%`,
                  height: pct(element.fontSize * 0.62, document.height),
                  minHeight: 1.5,
                  background: element.color,
                  opacity: 0.55,
                  borderRadius: 1,
                }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
