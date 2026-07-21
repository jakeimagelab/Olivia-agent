"use client";

import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { C } from "@/lib/theme";
import type { ChatAttachment } from "./types";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// 1단계에서는 프록시 다운로드 라우트를 만들지 않고 Drive 링크로 바로 연결한다
// (열람하려면 방 멤버로 공유된 Google 계정으로 로그인돼 있어야 한다).
export default function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const isImage = (attachment.mime_type || "").startsWith("image/");
  const url = `https://drive.google.com/file/d/${attachment.drive_file_id}/view`;
  const Icon = isImage ? ImageIcon : FileText;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex", alignItems: "center", gap: 8, marginTop: 6, padding: "8px 12px",
        borderRadius: 10, background: "#fff", border: `1px solid ${C.border}`, textDecoration: "none", maxWidth: 240,
      }}
    >
      <Icon size={16} color={C.teal} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {attachment.file_name}
        </div>
        <div style={{ fontSize: 10, color: C.hint }}>{formatSize(attachment.size_bytes)}</div>
      </span>
      <Paperclip size={12} color={C.hint} />
    </a>
  );
}
