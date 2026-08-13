"use client";

import { useEffect, useState } from "react";
import OliviaConversation from "@/components/olivia-v2/OliviaConversation";
import { OliviaIcon } from "@/components/olivia/OliviaChatPrimitives";

export default function OliviaFloatingConversation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" className="olivia-floating-core olivia-floating-core--global" onClick={() => setOpen((value) => !value)} aria-label="Olivia 대화 열기"><OliviaIcon size={18} /></button>
      <div className={`olivia-chat-drawer__scrim${open ? " is-open" : ""}`} aria-hidden="true" onClick={() => setOpen(false)} />
      <aside className={`olivia-chat-drawer olivia-chat-drawer--global${open ? " is-open" : ""}`} aria-hidden={!open}>
        <button type="button" className="olivia-chat-drawer__close" onClick={() => setOpen(false)}>닫기</button>
        <OliviaConversation variant="drawer" />
      </aside>
    </>
  );
}
