"use client";

import { Plus } from "lucide-react";
import { C } from "@/lib/theme";
import type { ChatRoom } from "./types";

export default function RoomList({
  rooms, activeRoomId, onSelect, onNewRoom,
}: {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  onSelect: (id: string) => void;
  onNewRoom: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>채팅방</span>
        <button
          onClick={onNewRoom}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, border: "none", background: C.mint, color: C.teal, cursor: "pointer" }}
          aria-label="새 채팅방"
        >
          <Plus size={16} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
        {rooms.length === 0 && (
          <div style={{ padding: "24px 12px", fontSize: 12, color: C.hint, textAlign: "center", lineHeight: 1.6 }}>
            아직 채팅방이 없어요.<br />+ 버튼으로 새로 만들어보세요.
          </div>
        )}
        {rooms.map((room) => {
          const active = room.id === activeRoomId;
          return (
            <button
              key={room.id}
              onClick={() => onSelect(room.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", marginBottom: 4,
                background: active ? C.mint : "transparent",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: room.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 800 : 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {room.name}
                </div>
                <div style={{ fontSize: 11, color: C.hint }}>
                  {room.memberCount ?? 0}명{room.olivia_enabled ? " · 올리비아 참여 중" : ""}
                </div>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
