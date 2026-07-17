"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PageHeader from "@/components/PageHeader";

const TITLE: Record<string, string> = {
  "/clients":          "고객 관리",
  "/select-galleries": "셀렉 갤러리",
  "/review-studio":    "Review Studio",
  "/per":              "PER 리워드",
};

const MESH_BG = [
  "radial-gradient(ellipse 130% 55% at 10% 0%,   rgba(21,88,85,.12)   0%, transparent 52%)",
  "radial-gradient(ellipse 90%  60% at 90% 100%,  rgba(235,143,34,.08) 0%, transparent 50%)",
  "radial-gradient(ellipse 80%  80% at 55% 50%,   rgba(86,155,140,.05) 0%, transparent 55%)",
  "#f0f4f2",
].join(",");

export default function ClientHubLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = TITLE[pathname] ?? (pathname.startsWith("/select-galleries") ? "셀렉 갤러리" : "고객 허브");
  const [inIframe, setInIframe] = useState(false);

  useEffect(() => {
    const isEmbed =
      (window.self !== window.top) ||
      document.documentElement.classList.contains("pc-embed") ||
      new URLSearchParams(window.location.search).get("embed") === "1";
    setInIframe(isEmbed);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: "#1C2B28" }}>
      {!inIframe && <PageHeader title={title} />}
      {!inIframe && HEADING[pathname] && (
        <PageHeading kicker={HEADING[pathname].kicker} title={HEADING[pathname].title} desc={HEADING[pathname].desc} />
      )}

      <nav className="pc-subnav pc-subnav--global" style={{
        background: "rgba(255,255,255,.72)",
        backdropFilter: "blur(16px) saturate(1.6)",
        WebkitBackdropFilter: "blur(16px) saturate(1.6)",
        borderBottom: "1px solid rgba(255,255,255,.7)",
        boxShadow: "0 1px 0 rgba(21,88,85,.07)",
        display: "flex", overflowX: "auto", position: "sticky", top: 56, zIndex: 90,
      }}>
        {HUB_TABS.map(t => (
          <Link
            key={t.href}
            href={t.href}
            className={`pc-hub-tab${pathname === t.href || pathname.startsWith(t.href + "/") ? " active" : ""}`}
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
