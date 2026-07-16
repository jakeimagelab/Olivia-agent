"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import AdminSidebar from "./admin/AdminSidebar";

function hasShareScope(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith("pc_share_scope="));
}

/* 예전엔 이 파일이 자체 아이콘 레일(pc-feature-sidebar)을 따로 그렸는데, /admin 콘솔을 만들면서
   두 개의 서로 다른 내비게이션이 생겨버렸다. 이제 /admin에서 쓰는 AdminSidebar를 그대로 재사용해서
   모든 페이지가 같은 사이드바를 쓴다 — 대시보드(홈)와 /admin/* 자체는 각자 알아서 사이드바를
   그리므로(AdminShell) 여기서는 제외한다. */
export default function GlobalFeatureSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname === "/";
  const isAdminArea = pathname === "/admin" || pathname?.startsWith("/admin/");
  // 마운트 전엔 false — 서버 렌더와 클라이언트 첫 렌더를 동일하게 유지해 hydration mismatch를 피한다
  // (PageHeader의 isSharedSession과 동일한 패턴).
  const [isShared, setIsShared] = useState(false);
  useEffect(() => { setIsShared(hasShareScope()); }, []);
  const show = !isDashboard && !isAdminArea && !isShared;

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  if (!show) return <>{children}</>;

  return (
    <div className="pc-gs-shell">
      <AdminSidebar open={sidebarOpen} inert={mobile && !sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button className="oa-shell__scrim" type="button" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="pc-gs-workspace">
        <button className="pc-gs-mobile-menu" type="button" onClick={() => setSidebarOpen(true)} aria-label="메뉴 열기">
          <Menu size={20} aria-hidden="true"/>
        </button>
        {children}
      </div>
    </div>
  );
}
