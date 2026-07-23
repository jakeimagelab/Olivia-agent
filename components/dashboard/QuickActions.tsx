"use client";

import Link from "next/link";
import { CalendarDays, Mail, UserPlus } from "lucide-react";

const ACTIONS = [
  { label: "캘린더", href: "/calendar", icon: CalendarDays, tone: "green" },
  { label: "고객 등록", href: "/clients?new=1", icon: UserPlus, tone: "orange" },
  { label: "메일링", href: "/mailing", icon: Mail, tone: "green" },
] as const;

export default function QuickActions() {
  return (
    <section className="home-quick" aria-labelledby="home-quick-title">
      <h2 id="home-quick-title">빠른 실행</h2>
      <div className="home-quick__grid">
        {ACTIONS.map(({ label, href, icon: Icon, tone }) => (
          <Link key={href} href={href} className={`home-quick__item is-${tone}`}>
            <span><Icon size={18} aria-hidden="true"/></span>
            <strong>{label}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
