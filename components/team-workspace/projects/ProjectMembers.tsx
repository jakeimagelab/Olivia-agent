import { C } from "@/lib/theme";

export default function ProjectMembers({ members }: { members: Array<any> }) {
  return members.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{members.map((item) => <span key={item.member_id} style={{ padding: "7px 9px", borderRadius: 9, background: C.mint, color: C.teal, fontSize: 11, fontWeight: 800 }}>{item.member?.display_name ?? "팀원"} · {item.role}</span>)}</div> : <div className="team-empty">프로젝트 멤버가 없습니다.</div>;
}
