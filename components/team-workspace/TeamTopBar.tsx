"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { C } from "@/lib/theme";

export default function TeamTopBar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const [memberName, setMemberName] = useState("팀원");
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/team-chat/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.ok && data.member) setMemberName(data.member.displayName);
        setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => undefined);
  }, []);
  return (
    <header className="team-topbar">
      <button type="button" className="team-menu-button" onClick={onMenu} aria-label="메뉴 열기"><Menu size={20} /></button>
      <h1>{title}</h1>
      <div className="team-user">
        <span>{memberName}</span>
        {isAdmin ? <b>관리자</b> : null}
      </div>
    </header>
  );
}
