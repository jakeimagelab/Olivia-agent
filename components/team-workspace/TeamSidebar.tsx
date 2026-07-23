"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarCheck2, CheckSquare2, FolderKanban, MessageCircle, Target, Users } from "lucide-react";
import { C } from "@/lib/theme";

const NAV = [
  { href: "/team/today", label: "오늘", icon: CalendarCheck2 },
  { href: "/team/chat", label: "팀채팅", icon: MessageCircle },
  { href: "/team/projects", label: "프로젝트", icon: FolderKanban },
  { href: "/team/tasks", label: "할 일", icon: CheckSquare2 },
  { href: "/team/goals", label: "목표", icon: Target },
  { href: "/team/reports", label: "팀 리포트", icon: BarChart3 },
] as const;

export default function TeamSidebar() {
  const pathname = usePathname();
  return (
    <aside className="team-sidebar">
      <Link href="/team/today" className="team-brand">
        <span className="team-brand-mark"><Users size={18} /></span>
        <span><b>Olivia Team</b><small>팀 워크스페이스</small></span>
      </Link>
      <nav className="team-nav" aria-label="팀 워크스페이스">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/team/today" && pathname.startsWith(`${href}/`));
          return (
            <Link key={href} href={href} className={`team-nav-link${active ? " is-active" : ""}`}>
              <Icon size={17} /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <Link href="/" className="team-back-home">Olivia 홈으로</Link>
    </aside>
  );
}
