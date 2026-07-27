"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Building2,
  Calendar,
  FileText,
  FolderKanban,
  Heart,
  Home,
  Image as ImageIcon,
  Coins,
  PenLine,
  Users,
} from "lucide-react";

type NavItem = {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href?: string;
  disabled?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "대시보드", icon: Home, href: "/clients" },
  { key: "list", label: "고객 관리", icon: Users, href: "/clients/list" },
  { key: "projects", label: "프로젝트", icon: FolderKanban, disabled: true },
  { key: "documents", label: "문서 관리", icon: FileText, href: "/clients/documents" },
  { key: "calendar", label: "일정 관리", icon: Calendar, href: "/calendar" },
  { key: "gallery", label: "앨범/갤러리", icon: ImageIcon, href: "/gallery" },
  { key: "revisions", label: "수정 요청", icon: PenLine, href: "/clients/revisions" },
  { key: "reviews", label: "리뷰 관리", icon: Heart, href: "/review-studio" },
  { key: "per", label: "PER 포인트", icon: Coins, href: "/per" },
  { key: "reports", label: "통계/보고서", icon: Building2, href: "/clients/reports" },
];

export default function PcrmSubNav() {
  const pathname = usePathname();

  return (
    <nav className="pcrm-subnav" aria-label="고객관리 메뉴">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        if (item.disabled || !item.href) {
          return (
            <button
              key={item.key}
              type="button"
              aria-disabled="true"
              data-muted="true"
              title="준비 중입니다."
              onClick={() => window.alert(`${item.label} 기능은 준비 중입니다.`)}
            >
              <Icon size={16} strokeWidth={1.8} />
              {item.label}
            </button>
          );
        }
        const active = item.href === "/clients" ? pathname === "/clients" : pathname.startsWith(item.href);
        return (
          <Link key={item.key} href={item.href} data-active={active}>
            <Icon size={16} strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
