"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Archive,
  CalendarDays,
  CircleHelp,
  Grid2X2,
  House,
  Link2,
  Mail,
  Megaphone,
  MessageCircle,
  NotebookPen,
  Settings,
  UsersRound,
  X,
} from "lucide-react";
import { groupToolsByCategory } from "@/lib/toolNav";

type NavigationItem = {
  label: string;
  href: string;
  icon: ComponentType<any>;
  accent?: "orange";
  exact?: boolean;
  /* 개별 기능 항목만 clientId/projectId 등 CRM 컨텍스트를 쿼리로 이어 붙인다 */
  carryContext?: boolean;
};

type NavigationSection = {
  key: string;
  label: string;
  items: NavigationItem[];
};

const toolItems = groupToolsByCategory().find((g) => g.category === "tools")?.items ?? [];

/* 대시보드/CRM 두 섹션은 소규모라 그대로 유지하고, 개별 기능만 lib/toolNav.ts(전역 사이드바와
   같은 소스)에서 끌어와 실제 존재하는 페이지 전체가 빠짐없이 나오게 한다 — 예전엔 이 목록이
   따로 하드코딩돼 있어서(11개, 그마저 절반은 실제 라우트가 아닌 가상 경로) 실제 15개 기능 중
   여러 개가 메뉴에서 아예 빠져 있었다. */
const navigation: NavigationSection[] = [
  {
    key: "dashboard",
    label: "메인 메뉴",
    items: [
      { label: "홈", href: "/admin/dashboard/home", icon: House, accent: "orange" },
      { label: "캘린더", href: "/calendar", icon: CalendarDays, accent: "orange" },
      { label: "메모", href: "/memo", icon: NotebookPen },
      { label: "메일링", href: "/mailing", icon: Mail, accent: "orange" },
      { label: "고객관리", href: "/clients", icon: UsersRound },
      { label: "워크스페이스", href: "/team", icon: MessageCircle },
      { label: "외부링크", href: "/link-generator", icon: Link2 },
      { label: "휴지통", href: "/trash", icon: Archive },
    ],
  },
  {
    key: "tools",
    label: "AI Assistant",
    items: [
      { label: "AI Assistant 홈", href: "/admin/tools", icon: Grid2X2, exact: true, carryContext: true },
      { label: "마케팅 대시보드", href: "/marketing", icon: Megaphone },
      ...toolItems.map((t) => ({ label: t.title, href: t.href, icon: t.icon, carryContext: true })),
    ],
  },
];

type AdminSidebarProps = {
  open?: boolean;
  inert?: boolean;
  onClose?: () => void;
};

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar({ open = false, inert = false, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const asideRef = useRef<HTMLElement>(null);
  const [contextSuffix, setContextSuffix] = useState("");

  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search);
    const context = new URLSearchParams();
    for (const key of ["clientId", "projectId", "workflowRunId", "stepKey"]) {
      const value = incoming.get(key);
      if (value) context.set(key, value);
    }
    setContextSuffix(context.size ? `?${context.toString()}` : "");
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const focusable = asideRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
    focusable?.[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  return (
    <aside ref={asideRef} className={`oa-sidebar${open ? " oa-sidebar--open" : ""}`} aria-label="관리자 메뉴" aria-hidden={inert || undefined} inert={inert || undefined}>
      <div className="oa-sidebar__brand">
        <Link className="oa-sidebar__brand-link" href="/admin/dashboard/home" onClick={onClose}>
          <span className="oa-sidebar__brand-mark" aria-hidden="true"><img src="/assets/photoclinic-mark.png" alt="" /></span>
          <span className="oa-sidebar__brand-copy">
            <strong>Olivia</strong>
            <small>Admin</small>
          </span>
        </Link>
        <button className="oa-sidebar__close" type="button" onClick={onClose} aria-label="메뉴 닫기">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <nav className="oa-sidebar__navigation" aria-label="주요 메뉴">
        {navigation.map((section) => (
          <section className="oa-sidebar__section" key={section.key} aria-labelledby={`oa-nav-${section.key}`}>
            <h2 className="oa-sidebar__section-label" id={`oa-nav-${section.key}`}>{section.label}</h2>
            <ul className="oa-sidebar__list">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = item.exact ? pathname === item.href : isActiveRoute(pathname, item.href);
                return (
                  <li className="oa-sidebar__list-item" key={item.href}>
                    <Link
                      className={`oa-sidebar__link${item.accent === "orange" ? " oa-sidebar__link--orange" : ""}${active ? " oa-sidebar__link--active" : ""}`}
                      href={`${item.href}${item.carryContext ? contextSuffix : ""}`}
                      aria-current={active ? "page" : undefined}
                      onClick={onClose}
                    >
                      <Icon className="oa-sidebar__link-icon" size={17} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="oa-sidebar__footer">
        <button className="oa-sidebar__footer-link" type="button" disabled title="2차 UI에서 제공 예정">
          <Settings size={17} aria-hidden="true" /> 설정
        </button>
        <button className="oa-sidebar__footer-link" type="button" disabled title="2차 UI에서 제공 예정">
          <CircleHelp size={17} aria-hidden="true" /> 도움말
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
