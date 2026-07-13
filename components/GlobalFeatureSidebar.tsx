"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { ALL_TOOLS } from "@/lib/toolNav";

const SIDEBAR_W = 216;

function hasShareScope(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith("pc_share_scope="));
}

/* 대시보드(홈)에서만 숨기고, 그 외 모든 기능 페이지에서는 좌측에 고정 노출 —
   기능 페이지에 들어갈 때마다 다시 대시보드로 돌아가지 않고도 다른 기능으로 바로 이동할 수 있게 한다.
   외부 공유 링크(pc_share_scope 쿠키)로 들어온 세션은 내부 전용 메뉴 전체를 보여줄 필요가 없어 숨긴다. */
export default function GlobalFeatureSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/";
  const isShared = hasShareScope();
  const show = !isDashboard && !isShared;

  return (
    <>
      {show && (
        <nav className="pc-feature-sidebar" aria-label="기능 메뉴">
          <Link href="/" className="pc-fs-item pc-fs-home">
            <LayoutGrid size={18} strokeWidth={2}/>
            <span>대시보드</span>
          </Link>
          <div className="pc-fs-divider"/>
          <div className="pc-fs-list">
            {ALL_TOOLS.map(t => {
              const active = pathname === t.href || pathname?.startsWith(t.href + "/");
              const Icon = t.icon;
              return (
                <Link key={t.href} href={t.href} className={`pc-fs-item${active ? " pc-fs-item--active" : ""}`}>
                  <Icon size={18}/>
                  <span>{t.title}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
      <div className="pc-fs-content" style={{ marginLeft: show ? SIDEBAR_W : 0 }}>
        {children}
      </div>
    </>
  );
}
