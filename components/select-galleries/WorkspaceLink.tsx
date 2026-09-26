"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { WindowContext } from "@/lib/store/useOliviaDesktopStore";

export type SelectGalleryNavigate = (href: string, title?: string, context?: WindowContext) => void;

export default function WorkspaceLink({
  href,
  title,
  context,
  onNavigate,
  className,
  style,
  children,
}: {
  href: string;
  title?: string;
  context?: WindowContext;
  onNavigate?: SelectGalleryNavigate;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(href, title, context);
  };

  return (
    <a href={href} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
