"use client";

import Link from "next/link";
import { CalendarDays, Mail, Mic, UserPlus, Users, Wand2 } from "lucide-react";

const ACTIONS = [
  { label: "캘린더", meta: "CALENDAR", desc: "오늘 일정", href: "/calendar", icon: CalendarDays, orange: true },
  { label: "고객 등록", meta: "NEW CLIENT", desc: "바로 등록", href: "/clients?new=1", icon: UserPlus, orange: true },
  { label: "메일링", meta: "MAILING", desc: "발송 확인", href: "/mailing", icon: Mail, orange: true },
  { label: "고객관리", meta: "CLIENTS", desc: "프로젝트", href: "/clients", icon: Users, orange: false },
  { label: "사진작업실", meta: "PHOTO", desc: "사진 작업", href: "/photo-sorting", icon: Wand2, orange: false },
  { label: "프롬프터", meta: "PROMPTER", desc: "대본 실행", href: "/prompter", icon: Mic, orange: false },
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
