import { C } from "@/lib/theme";

export default function TeamStatusPanel({ stats }: { stats: Array<any> }) {
  if (!stats.length) return <div className="team-empty">표시할 팀원 현황이 없습니다.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {stats.map((item) => (
        <div key={item.member.id} style={{ display: "grid", gridTemplateColumns: "minmax(100px,1fr) repeat(4,72px)", gap: 8, alignItems: "center", borderBottom: `1px solid ${C.border}`, padding: "9px 0", fontSize: 11 }}>
          <b style={{ color: C.teal }}>{item.member.display_name}</b><span>오늘 {item.todayCount}</span><span>진행 {item.inProgressCount}</span><span style={{ color: C.orange }}>확인 {item.reviewCount}</span><span style={{ color: C.success }}>완료 {item.completedCount}</span>
        </div>
      ))}
    </div>
  );
}
