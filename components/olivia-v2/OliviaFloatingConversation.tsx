"use client";

import { useState } from "react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";

export default function OliviaFloatingConversation() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="olivia-floating-core olivia-floating-core--global" onClick={() => setOpen((value) => !value)} aria-label="Olivia 대화 열기"><OliviaIcon size={18} /></button>
      <aside className={`olivia-chat-drawer olivia-chat-drawer--global${open ? " is-open" : ""}`} aria-hidden={!open}>
        <button type="button" className="olivia-chat-drawer__close" onClick={() => setOpen(false)}>닫기</button>
        <OliviaConversation variant="drawer" />
      </aside>
    </>
  );
}
