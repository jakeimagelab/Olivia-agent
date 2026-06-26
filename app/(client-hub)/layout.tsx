"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PageHeader from "@/components/PageHeader";

const HUB_TABS = [
  { href: "/clients",       label: "👥 고객 목록" },
  { href: "/review-studio", label: "⭐ 후기 콘텐츠" },
  { href: "/per",           label: "🏆 PER 리워드" },
];

const TITLE: Record<string, string> = {
  "/clients":       "고객 관리",
  "/review-studio": "Review Studio",
  "/per":           "PER 리워드",
};

export default function ClientHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLE[pathname] ?? "고객 허브";
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch (_) { setInIframe(true); }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F0F9F8", fontFamily: "'Noto Sans KR', sans-serif", color: "#1C2B28" }}>
      {!inIframe && <PageHeader title={title} />}

      <nav style={{ background: "#FFFFFF", borderBottom: "1px solid rgba(21,88,85,.12)", display: "flex", overflowX: "auto" }}>
        {HUB_TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-hub-tab${pathname === t.href ? " active" : ""}`}
            style={{ padding: "11px 22px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="pc-page-content">
        {children}
      </div>
    </div>
  );
}
