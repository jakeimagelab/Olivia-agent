"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

type AdminShellProps = {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
};

export function AdminShell({ children, aside, className = "" }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  return (
    <div className={`oa-shell${className ? ` ${className}` : ""}`}>
      <AdminSidebar open={sidebarOpen} inert={mobile && !sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          className="oa-shell__scrim"
          type="button"
          aria-label="메뉴 닫기"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="oa-shell__workspace">
        <AdminHeader onMenuToggle={() => setSidebarOpen((open) => !open)} />
        <div className={`oa-shell__body${aside ? " oa-shell__body--with-aside" : ""}`}>
          <main className="oa-shell__main">{children}</main>
          {aside && <aside className="oa-shell__aside" aria-label="보조 정보">{aside}</aside>}
        </div>
      </div>
    </div>
  );
}

export default AdminShell;
