"use client";

import { createContext, useContext, useLayoutEffect, useRef } from "react";

type SaveEditor = () => Promise<boolean>;

export const DocumentPortalEditorContext = createContext<{
  registerSave: (save: SaveEditor | null) => void;
  onSaved: () => void;
} | null>(null);

export function useDocumentPortalEditor(save: SaveEditor) {
  const portal = useContext(DocumentPortalEditorContext);
  const latestSave = useRef(save);
  useLayoutEffect(() => { latestSave.current = save; });
  useLayoutEffect(() => {
    if (!portal) return;
    portal.registerSave(() => latestSave.current());
    return () => portal.registerSave(null);
  }, [portal]);
  return portal;
}
