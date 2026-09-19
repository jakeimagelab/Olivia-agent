"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";
import type { AnalysisWorkspaceSurface } from "./AnalysisWorkspaceShell";

type AnalysisHostValue = {
  surface: AnalysisWorkspaceSurface;
  windowContext?: WindowContext;
};

const DEFAULT_HOST: AnalysisHostValue = { surface: "page" };
const AnalysisHostContext = createContext<AnalysisHostValue>(DEFAULT_HOST);

export function AnalysisHostProvider({ surface, windowContext, children }: AnalysisHostValue & { children: ReactNode }) {
  return (
    <AnalysisHostContext.Provider value={{ surface, windowContext }}>
      {children}
    </AnalysisHostContext.Provider>
  );
}

export function useAnalysisHost(): AnalysisHostValue {
  return useContext(AnalysisHostContext);
}
