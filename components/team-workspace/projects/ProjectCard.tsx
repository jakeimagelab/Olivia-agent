import Link from "next/link";
import { CalendarDays, CircleUserRound } from "lucide-react";
import { C } from "@/lib/theme";
import type { TeamProject } from "../types";

const TYPE_LABEL: Record<string, string> = { photo: "사진", film: "영상", web: "웹", ai_system: "AI 시스템", branding: "브랜딩", marketing: "마케팅", internal: "내부" };
const STATUS_LABEL: Record<string, string> = { planning: "기획", active: "진행 중", on_hold: "보류", completed: "완료", canceled: "취소" };

export default function ProjectCard({ project }: { project: TeamProject }) {
  return (
    <Link href={`/team/projects/${project.id}`} className="team-card" style={{ padding: 18, color: C.ink, textDecoration: "none", display: "grid", gap: 15 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div><div style={{ display: "flex", gap: 6, marginBottom: 8 }}><span style={pill}>{TYPE_LABEL[project.project_type]}</span><span style={{ ...pill, color: project.status === "active" ? C.success : C.muted }}>{STATUS_LABEL[project.status]}</span></div><h3 style={{ margin: 0, fontSize: 16, color: C.teal }}>{project.name}</h3></div>
        <b style={{ color: C.teal, fontSize: 18 }}>{project.progress}%</b>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: C.mint, overflow: "hidden" }}><div style={{ width: `${project.progress}%`, height: "100%", background: C.teal }} /></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: 11, color: C.muted }}><span><CircleUserRound size={12} style={{ verticalAlign: -2 }} /> {project.owner?.display_name ?? "책임자 없음"}</span><span><CalendarDays size={12} style={{ verticalAlign: -2 }} /> {project.due_date ?? "마감일 없음"}</span><span>미완료 {project.incompleteCount ?? 0}</span><span style={{ color: C.orange }}>확인 요청 {project.reviewCount ?? 0}</span></div>
    </Link>
  );
}
const pill = { fontSize: 10, fontWeight: 900, color: C.teal, background: C.mint, padding: "4px 7px", borderRadius: 999 } as const;
