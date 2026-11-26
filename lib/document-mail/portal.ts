import { isPcrmUuid } from "@/lib/pcrm/validation";
import { isDocumentMailKind, type DocumentMailKind, type DocumentMailReference } from "./shared";

type DocumentPortalAnchor = DocumentMailReference & { kind: "quote" | "contract" };

export type DocumentPortalTarget = {
  anchor: DocumentMailReference;
  tab: DocumentMailKind;
  documentId?: string;
};

export function documentPortalHref(anchor: DocumentPortalAnchor, tab: DocumentMailKind = anchor.kind, documentId?: string) {
  const params = new URLSearchParams({ resourceId: anchor.id, portal: "1", tab });
  if (documentId) params.set("document", documentId);
  return `${anchor.kind === "contract" ? "/contract" : "/quote"}?${params}`;
}

export function readDocumentPortalTarget(kind: "quote" | "contract", params: Pick<URLSearchParams, "get">): DocumentPortalTarget | null {
  const id = params.get("resourceId");
  if (params.get("portal") !== "1" || !isPcrmUuid(id)) return null;
  const tab = params.get("tab");
  const documentId = params.get("document");
  return { anchor: { kind, id }, tab: isDocumentMailKind(tab) ? tab : kind, documentId: isPcrmUuid(documentId) ? documentId : undefined };
}
