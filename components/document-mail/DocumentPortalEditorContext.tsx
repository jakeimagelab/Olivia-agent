"use client";

import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { DocumentPortalTarget } from "@/lib/document-mail/portal";

type SaveEditor = () => Promise<boolean>;

export type DocumentPortalContent =
  | { target: DocumentPortalTarget }
  | { chooseQuote: (id: string) => void }
  | { busy: string }
  | { error: string; retry: () => void };

export const DocumentPortalEditorContext = createContext<{
  active: boolean;
  registerSave: (save: SaveEditor) => () => void;
  onSaved: () => void;
  sidebar?: {
    id: string;
    expanded: boolean;
    show: (content: DocumentPortalContent) => void;
    update: (content: DocumentPortalContent) => void;
    close: () => void;
    reset: () => void;
  };
} | null>(null);

export function useDocumentPortalEditor(save: SaveEditor) {
  const portal = useContext(DocumentPortalEditorContext);
  const registerSave = portal?.active ? portal.registerSave : undefined;
  const latestSave = useRef(save);
  useLayoutEffect(() => { latestSave.current = save; });
  useLayoutEffect(() => registerSave?.(() => latestSave.current()), [registerSave]);
  return portal;
}
