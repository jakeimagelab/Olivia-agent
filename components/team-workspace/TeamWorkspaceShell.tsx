"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { C } from "@/lib/theme";
import TeamSidebar from "./TeamSidebar";
import TeamTopBar from "./TeamTopBar";

export default function TeamWorkspaceShell({
  title,
  children,
  fullBleed = false,
}: {
  title: string;
  children: ReactNode;
  fullBleed?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState("");
  useEffect(() => {
    fetch("/api/team-chat/session", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error(data?.error ?? "팀 세션을 확인하지 못했습니다.");
        return data;
      })
      .then(async (session) => {
        if (session.member) { setReady(true); return; }
        if (!session.isAdmin) {
          window.location.href = "/team-chat/login";
          return;
        }
        const response = await fetch("/api/team-chat/admin-join", { method: "POST" });
        const data = await response.json().catch(() => null);
        if (!data) throw new Error("관리자 팀 계정을 준비하지 못했습니다.");
        if (!data.ok) throw new Error(data.error);
        setReady(true);
      })
      .catch((error) => setBootstrapError(error instanceof Error ? error.message : "팀 계정을 준비하지 못했습니다."));
  }, []);
  return (
    <div className={`team-workspace${menuOpen ? " menu-open" : ""}`}>
      <TeamSidebar />
      {menuOpen ? <button className="team-sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기" /> : null}
      <div className="team-workspace-main">
        <TeamTopBar title={title} onMenu={() => setMenuOpen((value) => !value)} />
        <main className={fullBleed ? "team-content team-content--full" : "team-content"}>
          {bootstrapError ? <div className="team-error" style={{ margin: 20 }}>{bootstrapError}</div> : ready ? children : <div className="team-empty" style={{ margin: 20 }}>팀 워크스페이스 준비 중...</div>}
        </main>
      </div>
      <style jsx global>{`
        .team-workspace{min-height:100vh;background:${C.bg};color:${C.ink};font-family:'NanumSquare','Noto Sans KR',sans-serif;display:grid;grid-template-columns:224px minmax(0,1fr)}
        .team-sidebar{position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid ${C.border};padding:20px 14px;display:flex;flex-direction:column;z-index:30}
        .team-brand{display:flex;align-items:center;gap:10px;padding:4px 8px 22px;text-decoration:none;color:${C.ink}}
        .team-brand-mark{width:38px;height:38px;border-radius:12px;background:${C.teal};color:white;display:grid;place-items:center}
        .team-brand b,.team-brand small{display:block}.team-brand b{font-size:14px}.team-brand small{font-size:10px;color:${C.muted};margin-top:2px}
        .team-nav{display:flex;flex-direction:column;gap:4px}.team-nav-link{display:flex;align-items:center;gap:10px;min-height:42px;padding:0 12px;border-radius:10px;color:${C.muted};text-decoration:none;font-size:13px;font-weight:800}
        .team-nav-link:hover{background:${C.mint};color:${C.teal}}.team-nav-link.is-active{background:${C.mint};color:${C.teal}}
        .team-back-home{margin-top:auto;padding:12px;color:${C.muted};font-size:11px;font-weight:800;text-decoration:none}
        .team-workspace-main{min-width:0}.team-topbar{height:64px;background:rgba(255,255,255,.92);border-bottom:1px solid ${C.border};padding:0 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:20;backdrop-filter:blur(12px)}
        .team-topbar h1{font-size:17px;margin:0;color:${C.teal}}.team-user{display:flex;align-items:center;gap:7px;font-size:12px;color:${C.muted};font-weight:800}.team-user b{font-size:10px;color:${C.orange};background:#fff3ec;border-radius:999px;padding:4px 7px}
        .team-menu-button{display:none;border:0;background:transparent;color:${C.teal};padding:6px}.team-content{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:28px 0 60px}.team-content--full{width:100%;padding:0;height:calc(100vh - 64px)}
        .team-page-heading{margin-bottom:22px}.team-page-heading h2{font-size:26px;color:${C.teal};margin:0 0 7px}.team-page-heading p{font-size:13px;color:${C.muted};margin:0;line-height:1.6}
        .team-card{background:#fff;border:1px solid ${C.border};border-radius:16px;box-shadow:0 10px 28px rgba(21,88,85,.05)}
        .team-card-header{padding:17px 18px;border-bottom:1px solid ${C.border};display:flex;align-items:center;justify-content:space-between;gap:12px}.team-card-header h3{font-size:15px;color:${C.teal};margin:0}.team-card-body{padding:18px}
        .team-empty{padding:30px 18px;border-radius:12px;background:${C.mint};color:${C.muted};font-size:12px;text-align:center}
        .team-error{padding:11px 13px;border-radius:10px;background:#fef2f2;color:${C.danger};font-size:12px;font-weight:700}
        .team-button{border:0;border-radius:9px;min-height:36px;padding:0 13px;background:${C.teal};color:white;font-size:12px;font-weight:900;cursor:pointer}.team-button:disabled{opacity:.48;cursor:not-allowed}.team-button.secondary{background:white;color:${C.teal};border:1px solid ${C.border}}.team-button.orange{background:${C.orange}}
        .team-field{display:flex;flex-direction:column;gap:5px}.team-field label{font-size:11px;font-weight:800;color:${C.muted}}.team-input,.team-select,.team-textarea{width:100%;border:1px solid ${C.border};border-radius:9px;padding:9px 11px;font:inherit;font-size:12px;color:${C.ink};background:white;outline:none}.team-textarea{resize:vertical;min-height:88px}.team-input:focus,.team-select:focus,.team-textarea:focus{border-color:${C.sage};box-shadow:0 0 0 3px rgba(86,144,130,.12)}
        .team-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.team-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        .team-sidebar-scrim{display:none}
        @media(max-width:800px){.team-workspace{display:block}.team-sidebar{position:fixed;left:0;top:0;transform:translateX(-105%);transition:transform .2s ease;width:224px}.menu-open .team-sidebar{transform:translateX(0)}.team-sidebar-scrim{display:block;position:fixed;inset:0;border:0;background:rgba(28,43,40,.28);z-index:25}.team-menu-button{display:grid;place-items:center}.team-topbar{padding:0 14px}.team-user span{display:none}.team-content{width:min(100% - 24px,1180px);padding-top:18px}.team-grid-2,.team-grid-3{grid-template-columns:1fr}.team-content--full{width:100%;height:calc(100vh - 64px)}}
      `}</style>
    </div>
  );
}
