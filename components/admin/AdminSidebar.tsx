"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  CalendarDays,
  CircleHelp,
  Grid2X2,
  House,
  MessagesSquare,
  Settings,
  UsersRound,
  X,
} from "lucide-react";

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

/* 사이드바를 5개 핵심 항목으로 최소화 — 그 외 모든 기능(메모/업무일지/메일링/워크스페이스/
   외부링크/휴지통/카카오 AI비서/라이브러리/마케팅 등 lib/toolNav.ts의 ALL_TOOLS 전체)은
   "더보기"(/admin/tools)에서 카테고리별로 찾아 들어간다 — 각 항목이 사라진 게 아니라
   한 단계 안쪽으로 옮겨졌을 뿐이다. */
const navigation: NavigationSection[] = [
  {
    key: "main",
    label: "",
    items: [
      { label: "홈", href: "/admin/dashboard/home", icon: House, accent: "orange" },
      { label: "캘린더", href: "/calendar", icon: CalendarDays, accent: "orange" },
      { label: "프로젝트", href: "/clients", icon: UsersRound, carryContext: true },
      { label: "대화", href: "/admin/dashboard/conversations", icon: MessagesSquare },
      { label: "더보기", href: "/admin/tools", icon: Grid2X2, carryContext: true },
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
                      title={item.label}
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
        <button className="oa-sidebar__footer-link" type="button" disabled title="설정 · 2차 UI에서 제공 예정">
          <Settings size={17} aria-hidden="true" /> <span>설정</span>
        </button>
        <button className="oa-sidebar__footer-link" type="button" disabled title="도움말 · 2차 UI에서 제공 예정">
          <CircleHelp size={17} aria-hidden="true" /> <span>도움말</span>
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
