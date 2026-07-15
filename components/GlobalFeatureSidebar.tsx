"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, Menu, X } from "lucide-react";
import { ALL_TOOLS } from "@/lib/toolNav";

const SIDEBAR_RAIL_W = 64;

function hasShareScope(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith("pc_share_scope="));
}

/* 대시보드(홈)에서만 숨기고, 그 외 모든 기능 페이지에서는 좌측에 고정 노출 —
   기능 페이지에 들어갈 때마다 다시 대시보드로 돌아가지 않고도 다른 기능으로 바로 이동할 수 있게 한다.
   외부 공유 링크(pc_share_scope 쿠키)로 들어온 세션은 내부 전용 메뉴 전체를 보여줄 필요가 없어 숨긴다. */
export default function GlobalFeatureSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/";
  const isAdminArea = pathname === "/admin" || pathname?.startsWith("/admin/");
  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  // (PageHeader의 isSharedSession과 동일한 패턴).
  const [isShared, setIsShared] = useState(false);
  useEffect(() => { setIsShared(hasShareScope()); }, []);
  const show = !isDashboard && !isAdminArea && !isShared;

  // 모바일은 hover가 없어서 데스크탑처럼 레일에 마우스를 올려 펼치는 방식이 통하지 않는다 —
  // 대신 하단에 작은 트리거 버튼을 두고, 탭하면 라벨이 보이는 드로어를 연다. 페이지 이동 시(링크
  // 클릭) 즉시 닫아서 다음 페이지가 드로어에 가려 보이지 않게 한다.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const navItems = (
    <>
      <Link href="/" className="pc-fs-item pc-fs-home" title="대시보드" onClick={() => setMobileOpen(false)}>
        <LayoutGrid size={18} strokeWidth={2}/>
        <span className="pc-fs-label">대시보드</span>
      </Link>
      <div className="pc-fs-divider" aria-hidden="true"/>
      <div className="pc-fs-list">
        {ALL_TOOLS.map(t => {
          const active = pathname === t.href || pathname?.startsWith(t.href + "/");
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`pc-fs-item${active ? " pc-fs-item--active" : ""}`}
              aria-current={active ? "page" : undefined}
              title={t.title}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={18}/>
              <span className="pc-fs-label">{t.title}</span>
            </Link>
          );
        })}
      </div>
    </>
  );

  return (
    <>
      {show && (
        <nav className="pc-feature-sidebar" aria-label="기능 메뉴">
          {navItems}
        </nav>
      )}

      {show && (
        <button
          type="button"
          className="pc-fs-mobile-trigger"
          aria-label="기능 메뉴 열기"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={20}/>
        </button>
      )}

      {show && mobileOpen && (
        <div className="pc-fs-mobile-scrim" onClick={() => setMobileOpen(false)}>
          <nav
            className="pc-fs-mobile-drawer"
            aria-label="기능 메뉴"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="pc-fs-mobile-close"
              aria-label="기능 메뉴 닫기"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18}/>
            </button>
            {navItems}
          </nav>
        </div>
      )}

      <div className="pc-fs-content" style={{ marginLeft: show ? SIDEBAR_RAIL_W : 0 }}>
        {children}
      </div>
    </>
  );
}
