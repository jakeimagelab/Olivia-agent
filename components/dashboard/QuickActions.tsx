"use client";

import Link from "next/link";
import { CalendarDays, FileText, Grid2X2, Users } from "lucide-react";

const ACTIONS = [
  { label: "캘린더", meta: "CALENDAR", desc: "오늘 일정", href: "/calendar", icon: CalendarDays, orange: true },
  { label: "고객관리", meta: "CLIENTS", desc: "프로젝트", href: "/clients", icon: Users, orange: false },
  { label: "견적서", meta: "QUOTE", desc: "견적 작성", href: "/quote", icon: FileText, orange: true },
  { label: "기능 전체보기", meta: "ALL TOOLS", desc: "모든 기능", href: "/admin/tools", icon: Grid2X2, orange: false },
] as const;

export default function QuickActions() {
  return (
    <section className="home-quick" aria-labelledby="home-quick-title">
      <h2 id="home-quick-title">빠른 실행</h2>
      <div className="home-quick__grid">
        {ACTIONS.map(({ label, meta, desc, href, icon: Icon, orange }) => (
          <Link key={href} href={href} className={`home-quick__item${orange ? " is-orange" : ""}`}>
            <span className="home-quick__icon"><Icon size={19} aria-hidden="true"/></span>
            <span className="home-quick__copy">
              <small>{meta}</small>
              <strong>{label}</strong>
              <em>{desc}</em>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
