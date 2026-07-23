"use client";

import { C } from "@/lib/theme";
import AttachmentPreview from "./AttachmentPreview";
import MessageActions from "./MessageActions";
import type { ChatMessage } from "./types";

export default function MessageBubble({
  message, isOwn, senderName, roomProjectId, onChanged,
}: {
  message: ChatMessage;
  isOwn: boolean;
  senderName: string;
  roomProjectId?: string | null;
  onChanged: () => void;
}) {
  const isOlivia = message.sender_type === "olivia";
  const time = new Date(message.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ display: "flex", flexDirection: isOwn ? "row-reverse" : "row", gap: 8, marginBottom: 14, alignItems: "flex-start" }}>
      <div
        style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center",
          background: isOlivia ? C.orange : C.teal, color: "#fff", fontSize: 12, fontWeight: 800,
        }}
      >
        {isOlivia ? "🤖" : senderName.slice(0, 1)}
      </div>
      <div style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{isOlivia ? "올리비아" : senderName}</div>
          <MessageActions message={message} roomProjectId={roomProjectId} onChanged={onChanged} />
        </div>
        {message.body && (
          <div
            style={{
              padding: "9px 13px", borderRadius: 14, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: isOwn ? C.teal : isOlivia ? "#FFF3EC" : C.mint,
              color: isOwn ? "#fff" : C.ink,
              borderTopLeftRadius: isOwn ? 14 : 4,
              borderTopRightRadius: isOwn ? 4 : 14,
            }}
          >
            {message.body}
          </div>
        )}
        {message.chat_attachments?.map((att) => <AttachmentPreview key={att.id} attachment={att} />)}
        {message.linked_tasks?.length ? (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6, justifyContent: isOwn ? "flex-end" : "flex-start" }}>
            {message.linked_tasks.slice(0, 2).map((task) => (
              <a key={task.id} href={`/team?tab=tasks&task=${encodeURIComponent(task.id)}`} style={{ fontSize: 10, fontWeight: 800, color: C.teal, background: C.mint, borderRadius: 999, padding: "4px 7px", textDecoration: "none" }}>
                업무로 등록됨 · {task.title}
              </a>
            ))}
            {message.linked_tasks.length > 2 ? <span style={{ fontSize: 10, color: C.muted, padding: "4px 2px" }}>+{message.linked_tasks.length - 2}</span> : null}
          </div>
        ) : null}
        <div style={{ fontSize: 10, color: C.hint, marginTop: 3 }}>{time}</div>
      </div>
    </div>
  );
}
