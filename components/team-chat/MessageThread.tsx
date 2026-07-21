"use client";

import { useEffect, useRef } from "react";
import { C } from "@/lib/theme";
import MessageBubble from "./MessageBubble";
import type { ChatMember, ChatMessage } from "./types";

export default function MessageThread({
  messages, members, currentMemberId,
}: {
  messages: ChatMessage[];
  members: ChatMember[];
  currentMemberId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const nameById = new Map(members.map((m) => [m.id, m.display_name]));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
      {messages.length === 0 && (
        <div style={{ textAlign: "center", color: C.hint, fontSize: 12, padding: "40px 0" }}>
          아직 메시지가 없어요. 첫 메시지를 보내보세요!
        </div>
      )}
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          isOwn={m.sender_type === "member" && m.sender_member_id === currentMemberId}
          senderName={m.sender_member_id ? (nameById.get(m.sender_member_id) ?? "팀원") : "팀원"}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
