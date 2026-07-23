"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { C } from "@/lib/theme";

export default function TeamWorkspaceShell({
  children,
}: {
  children: ReactNode;
}) {
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

  if (bootstrapError) {
    return <div className="oa-page"><div className="team-error">{bootstrapError}</div></div>;
  }
  if (!ready) {
    return <div className="oa-page"><div className="team-empty">워크스페이스 준비 중...</div></div>;
  }

  return (
    <div className="workspace-page">
      {children}
      <style jsx global>{`
        .workspace-page{min-height:calc(100dvh - 112px);background:var(--mesh-bg);color:${C.ink};font-family:'NanumSquare','Noto Sans KR',sans-serif}
        .workspace-content{width:min(1380px,calc(100% - 40px));margin:0 auto;padding:24px 0 54px}
        .workspace-chat-panel{height:calc(100dvh - 172px);min-height:560px;overflow:hidden;border:1px solid ${C.border};border-radius:18px;background:#fff;box-shadow:0 12px 34px rgba(21,88,85,.06)}
        .team-page-heading{margin-bottom:18px}.team-page-heading h2{font-size:22px;color:${C.teal};margin:0 0 6px}.team-page-heading p{font-size:12px;color:${C.muted};margin:0;line-height:1.6}
        .team-card{background:#fff;border:1px solid ${C.border};border-radius:16px;box-shadow:0 10px 28px rgba(21,88,85,.05)}
        .team-card-header{padding:17px 18px;border-bottom:1px solid ${C.border};display:flex;align-items:center;justify-content:space-between;gap:12px}.team-card-header h3{font-size:15px;color:${C.teal};margin:0}.team-card-body{padding:18px}
        .team-empty{padding:30px 18px;border-radius:12px;background:${C.mint};color:${C.muted};font-size:12px;text-align:center}
        .team-error{padding:11px 13px;border-radius:10px;background:#fef2f2;color:${C.danger};font-size:12px;font-weight:700}
        .team-button{border:0;border-radius:9px;min-height:36px;padding:0 13px;background:${C.teal};color:white;font-size:12px;font-weight:900;cursor:pointer}.team-button:disabled{opacity:.48;cursor:not-allowed}.team-button.secondary{background:white;color:${C.teal};border:1px solid ${C.border}}.team-button.orange{background:${C.orange}}
        .team-field{display:flex;flex-direction:column;gap:5px}.team-field label{font-size:11px;font-weight:800;color:${C.muted}}.team-input,.team-select,.team-textarea{width:100%;border:1px solid ${C.border};border-radius:9px;padding:9px 11px;font:inherit;font-size:12px;color:${C.ink};background:white;outline:none}.team-textarea{resize:vertical;min-height:88px}.team-input:focus,.team-select:focus,.team-textarea:focus{border-color:${C.sage};box-shadow:0 0 0 3px rgba(86,144,130,.12)}
        .team-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.team-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
        @media(max-width:800px){.workspace-content{width:min(100% - 24px,1380px);padding-top:16px}.workspace-chat-panel{height:calc(100dvh - 158px);min-height:480px;border-radius:14px}.team-grid-2,.team-grid-3{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
