"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  CalendarDays,
  Camera,
  CircleHelp,
  ClipboardList,
  Columns3,
  ContactRound,
  FileCheck2,
  FileSignature,
  FileText,
  FolderKanban,
  GalleryHorizontalEnd,
  Gift,
  House,
  ImageDown,
  ImagePlus,
  LayoutDashboard,
  Link2,
  ListChecks,
  Mail,
  MessageSquareText,
  PanelTop,
  SearchCheck,
  Settings,
  Sparkles,
  UsersRound,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

type NavigationItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

type NavigationSection = {
  key: string;
  label: string;
  items: NavigationItem[];
};

const navigation: NavigationSection[] = [
  {
    key: "dashboard",
    label: "관리자 대시보드",
    items: [
      { label: "홈", href: "/admin/dashboard/home", icon: House },
      { label: "상담", href: "/admin/dashboard/consultations", icon: MessageSquareText },
      { label: "캘린더", href: "/admin/dashboard/calendar", icon: CalendarDays },
      { label: "메일링", href: "/admin/dashboard/mailing", icon: Mail },
      { label: "외부링크", href: "/admin/dashboard/links", icon: Link2 },
      { label: "휴지통", href: "/admin/dashboard/trash", icon: Archive },
    ],
  },
  {
    key: "crm",
    label: "고객관리 CRM",
    items: [
      { label: "CRM 대시보드", href: "/admin/crm/dashboard", icon: LayoutDashboard },
      { label: "고객 목록", href: "/admin/crm/clients", icon: UsersRound },
      { label: "프로젝트 목록", href: "/admin/crm/projects", icon: FolderKanban },
      { label: "프로젝트 보드", href: "/admin/crm/board", icon: Columns3 },
      { label: "프로젝트 워크플로우", href: "/admin/crm/workflows", icon: ListChecks },
      { label: "지연 / 확인 필요", href: "/admin/crm/issues", icon: SearchCheck },
      { label: "후속 관리", href: "/admin/crm/aftercare", icon: ContactRound },
    ],
  },
  {
    key: "tools",
    label: "개별 기능",
    items: [
      { label: "견적서 생성기", href: "/admin/tools/quote", icon: FileText },
      { label: "계약서 생성기", href: "/admin/tools/contract", icon: FileSignature },
      { label: "콘티 생성기", href: "/admin/tools/conti", icon: PanelTop },
      { label: "사진 분류기", href: "/admin/tools/photo-sorting", icon: ImagePlus },
      { label: "셀렉 갤러리", href: "/admin/tools/select-galleries", icon: GalleryHorizontalEnd },
      { label: "RAW 자동 매칭", href: "/admin/tools/raw-matching", icon: Camera },
      { label: "보정 관리", href: "/admin/tools/retouching", icon: WandSparkles },
      { label: "AI 검색 최적화 납품", href: "/admin/tools/seo-delivery", icon: ImageDown },
      { label: "후기 DB", href: "/admin/tools/reviews", icon: FileCheck2 },
      { label: "리워드 관리", href: "/admin/tools/rewards", icon: Gift },
      { label: "콘텐츠 제작", href: "/admin/tools/content", icon: ClipboardList },
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
                const active = isActiveRoute(pathname, item.href);
                return (
                  <li className="oa-sidebar__list-item" key={item.href}>
                    <Link
                      className={`oa-sidebar__link${active ? " oa-sidebar__link--active" : ""}`}
                      href={`${item.href}${item.href.startsWith("/admin/tools/") ? contextSuffix : ""}`}
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
