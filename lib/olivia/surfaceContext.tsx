"use client";

import { createContext, useContext, type ReactNode } from "react";

export type OliviaUiSurface = "desktop" | "tablet" | "mobile";

const OliviaUiSurfaceContext = createContext<OliviaUiSurface>("desktop");

export function OliviaUiSurfaceProvider({
  value,
  children,
}: {
  value: OliviaUiSurface;
  children: ReactNode;
}) {
  return (
    <OliviaUiSurfaceContext.Provider value={value}>
      {children}
    </OliviaUiSurfaceContext.Provider>
  );
}

export function useOliviaUiSurface(): OliviaUiSurface {
  return useContext(OliviaUiSurfaceContext);
}
