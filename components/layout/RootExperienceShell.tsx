"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LegacyAppChrome = dynamic(() => import("./LegacyAppChrome"));

const OS_ROUTE_PATHS = new Set(["/", "/desktop", "/admin/dashboard/home"]);

export default function RootExperienceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname && OS_ROUTE_PATHS.has(pathname)) return <>{children}</>;
  return <LegacyAppChrome>{children}</LegacyAppChrome>;
}
