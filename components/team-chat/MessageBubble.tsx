"use client";

import { C } from "@/lib/theme";
import AttachmentPreview from "./AttachmentPreview";
import type { ChatMessage } from "./types";

export default function MessageBubble({
  message, isOwn, senderName,
}: {
  message: ChatMessage;
  isOwn: boolean;
  senderName: string;
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
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 3, fontWeight: 700 }}>{isOlivia ? "올리비아" : senderName}</div>
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
        <div style={{ fontSize: 10, color: C.hint, marginTop: 3 }}>{time}</div>
      </div>
    </div>
  );
}
