"use client";

import { useRef, useState } from "react";
import { Paperclip, Send } from "lucide-react";
import { C } from "@/lib/theme";

export default function Composer({
  onSend, disabled,
}: {
  onSend: (body: string, file: File | null) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    try {
      await onSend(text.trim(), file);
      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", background: "#fff" }}>
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12, color: C.teal, background: C.mint, borderRadius: 8, padding: "6px 10px" }}>
          📎 {file.name}
          <button
            onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
            style={{ marginLeft: "auto", border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <input ref={fileInputRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending}
          style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff", color: C.muted, cursor: "pointer", display: "grid", placeItems: "center" }}
          aria-label="파일 첨부"
        >
          <Paperclip size={16} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="메시지를 입력하세요 (@올리비아로 멘션 가능)"
          rows={1}
          disabled={disabled || sending}
          style={{ flex: 1, resize: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", minHeight: 38, maxHeight: 120, outline: "none" }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || sending || (!text.trim() && !file)}
          style={{
            flexShrink: 0, width: 38, height: 38, borderRadius: 10, border: "none", background: C.teal, color: "#fff",
            cursor: "pointer", display: "grid", placeItems: "center",
            opacity: disabled || sending || (!text.trim() && !file) ? 0.5 : 1,
          }}
          aria-label="전송"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
