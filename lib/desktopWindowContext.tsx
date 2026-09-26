"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

const DesktopWindowContext = createContext(false);

export const DesktopWindowProvider = DesktopWindowContext.Provider;

export function useDesktopWindowMode(): boolean {
  return useContext(DesktopWindowContext);
}

export type DesktopWindowNavigate = (href: string, title?: string, context?: WindowContext) => void;

export type DesktopWindowRouteValue = {
  clientId?: string;
  workflowRunId?: string;
  routeHref?: string;
  navigate?: DesktopWindowNavigate;
};

const DesktopWindowRouteContext = createContext<DesktopWindowRouteValue>({});

export function DesktopWindowRouteProvider({
  value,
  children,
}: {
  value: DesktopWindowRouteValue;
  children: ReactNode;
}) {
  return (
    <DesktopWindowRouteContext.Provider value={value}>
      {children}
    </DesktopWindowRouteContext.Provider>
  );
}

export function useDesktopWindowRoute(): DesktopWindowRouteValue {
  return useContext(DesktopWindowRouteContext);
}
