export type ContiScheduleBlockProps = {
  time: string;
  activity: string;
  type?: string;
  requirements?: string;
};

export default function ContiScheduleBlock({ time, activity, type, requirements }: ContiScheduleBlockProps) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      background: "#fff", borderRadius: 12, overflow: "hidden",
      border: "1px solid #C8DDD9",
      boxShadow: "0 1px 6px rgba(21,88,85,0.06)",
    }}>
      <div style={{
        background: "#155855", padding: "14px 18px",
        display: "flex", alignItems: "center", justifyContent: "center",
        minWidth: 100, flexShrink: 0,
      }}>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>{time}</span>
      </div>
      <div style={{ padding: "14px 18px", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ color: "#1C2B28", fontWeight: 800, fontSize: 15 }}>{activity}</span>
          {type ? (
            <span style={{ color: "#E85D2C", fontSize: 11, fontWeight: 700, background: "rgba(232,93,44,0.1)", padding: "2px 8px", borderRadius: 99 }}>{type}</span>
          ) : null}
        </div>
        {requirements ? <div style={{ color: "#5A7470", fontSize: 13 }}>{requirements}</div> : null}
      </div>
    </div>
  );
}
