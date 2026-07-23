"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus, Settings } from "lucide-react";
import { C } from "@/lib/theme";
import OliviaToggle from "./OliviaToggle";
import type { ChatMember, ChatRoom } from "./types";

export default function RoomHeader({
  room, members, allMembers, isAdmin, onRename, onToggleOlivia, onAddMember,
}: {
  room: ChatRoom;
  members: ChatMember[];
  allMembers: ChatMember[];
  isAdmin: boolean;
  onRename: (name: string) => void;
  onToggleOlivia: (enabled: boolean) => void;
  onAddMember: (memberId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [showAdd, setShowAdd] = useState(false);

  const addable = allMembers.filter((m) => !members.some((rm) => rm.id === m.id));

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: "#fff", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { setEditing(false); if (name.trim() && name !== room.name) onRename(name.trim()); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            style={{ fontSize: 15, fontWeight: 800, color: C.ink, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", outline: "none" }}
          />
        ) : (
          <div onClick={() => setEditing(true)} style={{ fontSize: 15, fontWeight: 800, color: C.ink, cursor: "pointer" }}>
            {room.name}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {members.map((m) => m.display_name).join(", ")}
        </div>
        {room.team_project ? (
          <Link href={`/team/projects/${room.team_project.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 5, color: C.teal, fontSize: 10, fontWeight: 800, textDecoration: "none" }}>
            {room.team_project.name} · 진행률 {room.team_project.progress}% · {room.team_project.status}
          </Link>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", flexShrink: 0 }}>
        <OliviaToggle enabled={room.olivia_enabled} onChange={onToggleOlivia} />
        <button
          onClick={() => setShowAdd((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: C.teal, background: C.mint, border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
        >
          <UserPlus size={14} /> 초대
        </button>
        {showAdd && (
          <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(21,88,85,.12)", padding: 8, minWidth: 180, zIndex: 10 }}>
            {addable.length === 0 ? (
              <div style={{ fontSize: 12, color: C.hint, padding: "6px 8px" }}>추가할 팀원이 없어요.</div>
            ) : (
              addable.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { onAddMember(m.id); setShowAdd(false); }}
                  style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12, padding: "6px 8px", border: "none", background: "transparent", cursor: "pointer", borderRadius: 6, color: C.ink }}
                >
                  {m.display_name}
                </button>
              ))
            )}
          </div>
        )}
        {isAdmin && (
          <Link href="/admin/team-chat-settings" style={{ display: "flex", alignItems: "center", color: C.muted }} aria-label="팀 채팅 설정">
            <Settings size={16} />
          </Link>
        )}
      </div>
    </div>
  );
}
