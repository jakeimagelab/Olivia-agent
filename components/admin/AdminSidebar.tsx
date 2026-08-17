"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  BarChart3,
  CalendarDays,
  CircleHelp,
  FileText,
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
  { label: "채팅", href: "/admin/dashboard/conversations", icon: MessagesSquare },
  { label: "고객 관리", href: "/clients", icon: UsersRound, carryContext: true },
  { label: "문서", href: "/quote", icon: FileText, carryContext: true },
  { label: "일정", href: "/calendar", icon: CalendarDays, accent: "orange" },
  { label: "보고서", href: "/admin/tools?category=report", icon: BarChart3 },
  { label: "더보기", href: "/admin/tools", icon: Grid2X2, carryContext: true },
];

type AdminSidebarProps = {
  open?: boolean;
  inert?: boolean;
  onClose?: () => void;
};

type FavoriteClient = { clientId: string; name: string };

function isActiveRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const FAVORITE_SWATCHES = ["#155855", "#E85D2C", "#569082", "#EB8F22"];

export function AdminSidebar({ open = false, inert = false, onClose }: AdminSidebarProps) {
  const pathname = usePathname();
  const asideRef = useRef<HTMLElement>(null);
  const [contextSuffix, setContextSuffix] = useState("");
  // "즐겨찾기"는 아직 사용자가 직접 고르는 별도 pin 기능이 없어서(3절: "즐겨찾기 고객 유지
  // 가능" — 새 즐겨찾기 기능을 만들라는 요구는 아님), 가장 최근에 다룬 활성 프로젝트 상위
  // 3개를 실제 데이터로 대신 보여준다.
  const [favorites, setFavorites] = useState<FavoriteClient[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workflow/summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data?.workflowRuns)) return;
        const seen = new Set<string>();
        const list: FavoriteClient[] = [];
        for (const run of data.workflowRuns as { status: string; client_id: string | null; client_name: string; updated_at: string }[]) {
          if (run.status !== "active" || !run.client_id || seen.has(run.client_id)) continue;
          seen.add(run.client_id);
          list.push({ clientId: run.client_id, name: run.client_name || "이름 없는 고객" });
          if (list.length >= 3) break;
        }
        setFavorites(list);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
