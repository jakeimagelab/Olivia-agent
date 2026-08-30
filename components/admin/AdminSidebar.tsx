"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  CalendarDays,
  ChevronDown,
  FolderOpen,
  Grid2X2,
  House,
  LogOut,
  MessagesSquare,
  ShieldCheck,
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

/* 사이드바를 핵심 항목으로 최소화 — 그 외 모든 기능(메모/업무일지/메일링/워크스페이스/
   외부링크/휴지통/카카오 AI비서/라이브러리/마케팅 등 lib/toolNav.ts의 ALL_TOOLS 전체)은
   "더보기"(/admin/tools)에서 카테고리별로 찾아 들어간다 — 각 항목이 사라진 게 아니라
   한 단계 안쪽으로 옮겨졌을 뿐이다. 문서/일정/보고서는 기존 견적(/quote)·캘린더(/calendar)·
   통계(/admin/tools?category=report) 화면을 그대로 가리킨다(UI/UX 통일 개편 3절 — "필요한
   기존 메뉴가 있다면 하위 메뉴로 유지 가능"). 시안은 "프로젝트"/"고객 관리"를 각자 다른 항목
   으로 그리지만, 이 코드베이스는 52절이 명시한 대로 /clients?id=CLIENT 단일 구조라 같은
   목적지를 둘로 쪼개면 둘 다 항상 active로 겹쳐 보이는 버그가 난다 — "고객 관리" 하나로
   합쳐서 부른다(기능은 그대로, 이름만 시안 기준으로 통일). */
const navigation: NavigationItem[] = [
  { label: "홈", href: "/admin/dashboard/home", icon: House, accent: "orange" },
  { label: "일정", href: "/calendar", icon: CalendarDays, accent: "orange" },
  { label: "고객 관리", href: "/clients", icon: UsersRound, carryContext: true },
  { label: "기록 (대화)", href: "/admin/dashboard/conversations", icon: MessagesSquare },
  { label: "전체보기 (기능)", href: "/admin/tools", icon: Grid2X2, carryContext: true },
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
  const [profileOpen, setProfileOpen] = useState(false);

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
            <small>Agent</small>
          </span>
        </Link>
        <button className="oa-sidebar__close" type="button" onClick={onClose} aria-label="메뉴 닫기">
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <nav className="oa-sidebar__navigation" aria-label="주요 메뉴">
        <ul className="oa-sidebar__list">
          {navigation.map((item) => {
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

      </nav>

      <div className="oa-sidebar__footer">
        {profileOpen ? (
          <div className="oa-sidebar__profile-menu">
            <Link href="/admin/security" onClick={() => { setProfileOpen(false); onClose?.(); }}><ShieldCheck size={16} /> 계정 및 보안</Link>
            <Link href="/admin/team-chat-settings" onClick={() => { setProfileOpen(false); onClose?.(); }}><Settings size={16} /> 설정</Link>
            <a href="/api/auth/signout"><LogOut size={16} /> 로그아웃</a>
          </div>
        ) : null}
        <button className="oa-sidebar__profile-card" type="button" aria-label="현재 사용자 정연호 대표" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>
          <span className="oa-sidebar__profile-mark"><img src="/assets/photoclinic-mark.png" alt="" /></span>
          <span className="oa-sidebar__profile-copy"><strong>정연호 대표</strong><small>포토클리닉</small><em><i /> 온라인</em></span>
          <ChevronDown className={profileOpen ? "is-open" : ""} size={16} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;
