"use client";

import { createContext, useContext } from "react";

const DesktopWindowContext = createContext(false);

export const DesktopWindowProvider = DesktopWindowContext.Provider;

export function useDesktopWindowMode(): boolean {
  return useContext(DesktopWindowContext);
}
