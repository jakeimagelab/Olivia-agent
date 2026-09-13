"use client";

import { Clapperboard, File, FileSignature, FileText, Images, StickyNote } from "lucide-react";
import type { OliviaDocumentType } from "@/lib/olivia/documents/types";
import styles from "./DocumentsWindowContent.module.css";

type DocumentTypeIconProps = {
  type: OliviaDocumentType;
  size?: number;
};

const TYPE_META: Record<OliviaDocumentType, { tone: string; Icon: typeof FileText }> = {
  quote: { tone: "quote", Icon: FileText },
  contract: { tone: "contract", Icon: FileSignature },
  storyboard: { tone: "storyboard", Icon: Clapperboard },
  report: { tone: "general", Icon: FileText },
  checklist: { tone: "general", Icon: FileText },
  revision: { tone: "general", Icon: FileText },
  memo: { tone: "memo", Icon: StickyNote },
  project_document: { tone: "general", Icon: FileText },
  uploaded_file: { tone: "general", Icon: File },
  gallery: { tone: "gallery", Icon: Images },
  other: { tone: "other", Icon: File },
};

export function DocumentTypeIcon({ type, size = 22 }: DocumentTypeIconProps) {
  const meta = TYPE_META[type] ?? TYPE_META.other;
  const Icon = meta.Icon;
  return (
    <span className={`${styles.typeIcon} ${styles[`typeIcon_${meta.tone}`]}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}
