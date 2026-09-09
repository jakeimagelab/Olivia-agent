export type ContiChecklistRowProps = {
  category: string;
  item: string;
  notes?: string;
  /** true면 실제 클릭 가능한 체크박스(편집 화면), false/미지정이면 표시만 하는 빈 사각형(공유뷰). */
  interactive?: boolean;
};

export default function ContiChecklistRow({ category, item, notes, interactive }: ContiChecklistRowProps) {
  const body = (
    <>
      {interactive ? (
        <input type="checkbox" style={{ width: 22, height: 22, accentColor: "#155855", cursor: "pointer", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 20, height: 20, border: "2px solid #155855", borderRadius: 5, flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: "#7A9E9B", fontSize: 11, fontWeight: 700 }}>{category} · </span>
        <span style={{ color: "#1C2B28", fontSize: 14, fontWeight: 700 }}>{item}</span>
        {notes ? <span style={{ color: "#9BB5B0", fontSize: 12, marginLeft: 6 }}>({notes})</span> : null}
      </div>
    </>
  );

  const rowStyle = {
    display: "flex", alignItems: "center", gap: 14,
    background: "#fff", borderRadius: 12, padding: "14px 18px",
    border: "1px solid #C8DDD9", boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
  } as const;

  return interactive
    ? <label style={{ ...rowStyle, cursor: "pointer", userSelect: "none" }}>{body}</label>
    : <div style={rowStyle}>{body}</div>;
}
