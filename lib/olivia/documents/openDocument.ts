import type { OliviaDocumentType } from "./types";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export type DocumentOpenReference = {
  title: string;
  type: OliviaDocumentType;
  route?: string | null;
  sourceId?: string;
  metadata?: { sourceId?: string };
};

export type DocumentOpenTarget = {
  href: string;
  title: string;
  context: WindowContext;
};

// 문서 카드와 열기 동작 사이의 단일 경계다. route가 없는 문서는 여기서 null이 되어
// 브라우저 기본 이동이나 빈 탭을 만들 수 없다.
export function getDocumentOpenTarget(document: DocumentOpenReference): DocumentOpenTarget | null {
  if (!document.route) return null;
  return {
    href: document.route,
    title: document.title,
    context: {
      resourceId: document.sourceId ?? document.metadata?.sourceId,
      resourceType: document.type,
    },
  };
}
