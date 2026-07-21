"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { C } from "@/lib/theme";
import type { ChatMember } from "./types";

export default function NewRoomDialog({
  allMembers, onCreate, onClose,
}: {
  allMembers: ChatMember[];
  onCreate: (name: string, memberIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await onCreate(name.trim(), selected);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(21,88,85,.25)", display: "grid", placeItems: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, width: 340, boxShadow: "0 20px 60px rgba(21,88,85,.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>새 채팅방</span>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}>
            <X size={18} />
          </button>
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="방 이름"
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14, outline: "none" }}
        />
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>참여할 팀원 선택</div>
        <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 16 }}>
          {allMembers.length === 0 && <div style={{ fontSize: 12, color: C.hint }}>초대된 팀원이 없어요.</div>}
          {allMembers.map((m) => (
            <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 13, color: C.ink, cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.display_name}
            </label>
          ))}
        </div>
        <button onClick={submit} disabled={!name.trim() || creating} className="pc-btn pc-btn--primary" style={{ width: "100%" }}>
          {creating ? "만드는 중..." : "만들기"}
        </button>
      </div>
    </div>
  );
}
