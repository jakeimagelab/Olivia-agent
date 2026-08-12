"use client";

import Link from "next/link";
import { Camera, Clapperboard, FileText, UploadCloud } from "lucide-react";

const ACTIONS = [
  { label: "견적", href: "/quote", icon: FileText },
  { label: "콘티", href: "/conti", icon: Clapperboard },
  { label: "촬영 준비", href: "/work-journal", icon: Camera },
  { label: "자료 업로드", href: "/select-galleries", icon: UploadCloud },
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
            <Icon size={21} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
