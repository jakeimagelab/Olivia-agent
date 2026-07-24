"use client";

import { File, FileImage, FileSpreadsheet, FileText, RotateCcw, X } from "lucide-react";
import type { OliviaChatAttachment } from "@/lib/olivia/chatAttachments";

export type PendingOliviaAttachment = {
  localId: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
  attachment?: OliviaChatAttachment;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function FileIcon({ kind }: { kind?: OliviaChatAttachment["kind"] }) {
  if (kind === "image") return <FileImage size={15} />;
  if (kind === "spreadsheet") return <FileSpreadsheet size={15} />;
  if (kind === "text" || kind === "pdf") return <FileText size={15} />;
  return <File size={15} />;
}

export function OliviaChatAttachmentTray({
  items,
  onRemove,
  onRetry,
}: {
  items: PendingOliviaAttachment[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="olivia-chat-attachment-tray">
      {items.map((item) => (
        <div key={item.localId} className={`olivia-chat-attachment-chip is-${item.status}`}>
          {item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.previewUrl} alt="" />
          ) : (
            <span className="olivia-chat-attachment-chip__icon"><FileIcon kind={item.attachment?.kind} /></span>
          )}
          <span className="olivia-chat-attachment-chip__copy">
            <strong title={item.file.name}>{item.file.name}</strong>
            <small>{item.status === "uploading" ? "업로드 중…" : item.status === "error" ? item.error : formatBytes(item.file.size)}</small>
          </span>
          {item.status === "error" ? (
            <button type="button" onClick={() => onRetry(item.localId)} aria-label={`${item.file.name} 다시 업로드`}><RotateCcw size={12} /></button>
          ) : null}
          <button type="button" onClick={() => onRemove(item.localId)} aria-label={`${item.file.name} 제거`}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

export function OliviaChatMessageAttachments({ attachments }: { attachments?: OliviaChatAttachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="olivia-chat-message-attachments">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={attachment.downloadUrl || undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!attachment.downloadUrl}
          className={attachment.kind === "image" ? "is-image" : ""}
        >
          {attachment.kind === "image" && attachment.downloadUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.downloadUrl} alt={attachment.fileName} loading="lazy" />
          ) : (
            <span><FileIcon kind={attachment.kind} /></span>
          )}
          <span>
            <strong>{attachment.fileName}</strong>
            <small>{formatBytes(attachment.sizeBytes)}{attachment.analysisStatus === "stored_only" ? " · 보관용" : ""}</small>
          </span>
        </a>
      ))}
    </div>
  );
}
