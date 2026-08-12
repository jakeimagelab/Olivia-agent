"use client";

import Link from "next/link";
import { CalendarDays, FileSignature, Grid2X2, Users } from "lucide-react";

const ACTIONS = [
  { label: "캘린더", href: "/calendar", icon: CalendarDays },
  { label: "계약서", href: "/contract", icon: FileSignature },
  { label: "고객관리", href: "/clients", icon: Users },
  { label: "전체보기", href: "/admin/tools", icon: Grid2X2 },
] as const;

export default function QuickActions() {
  return (
    <section className="pc-panel pc-quick-panel">
      <div className="pc-panel__header">
        <h3>빠른 실행</h3>
        <Link href="/admin/tools" className="pc-text-button">더보기</Link>
      </div>

      <div className="pc-quick-actions">
        {ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className="pc-quick-action">
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
