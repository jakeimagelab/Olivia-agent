"use client";

import Link from "next/link";
import {
  FileText,
  FolderKanban,
  Heart,
  Home,
  Images,
  ListChecks,
  MessageSquareText,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { C, R } from "@/lib/theme";

export function PortalHeader({
  clientName,
  projectName,
  managerName,
}: {
  clientName?: string;
  projectName?: string;
  managerName?: string;
}) {
  return (
    <header className="pcrm-portal-header">
      <div className="pcrm-portal-brand">
        <img src="/assets/photoclinic-mark.png" alt="" />
        <span className="pcrm-portal-wordmark"><b>PHOTO</b>CLINIC</span>
        <i />
        <strong>고객 전용 PCRM</strong>
      </div>
      {clientName && (
        <div className="pcrm-portal-client">
          <span>{projectName || "프로젝트"}</span>
          <strong>{clientName}</strong>
          {managerName && <small>담당 {managerName}</small>}
        </div>
      )}
    </header>
  );
}

export function PortalNav({
  active,
  visibleMenus,
}: {
  active: string;
  visibleMenus?: Record<string, boolean>;
}) {
  const items = [
    { key: "dashboard", href: "/client-portal/dashboard", label: "홈", Icon: Home },
    { key: "documents", href: "/client-portal/documents", label: "문서함", Icon: FileText },
    { key: "progress", href: "/client-portal/progress", label: "진행현황", Icon: FolderKanban },
    { key: "preparation", href: "/client-portal/preparation", label: "촬영 준비", Icon: ListChecks },
    { key: "conti", href: "/client-portal/conti", label: "콘티", Icon: FileText },
    { key: "gallery", href: "/client-portal/gallery", label: "갤러리", Icon: Images },
    { key: "revision", href: "/client-portal/revision", label: "수정 요청", Icon: PenLine },
    { key: "inquiries", href: "/client-portal/inquiries", label: "문의", Icon: MessageSquareText },
    { key: "review", href: "/client-portal/review", label: "리뷰", Icon: Heart },
    { key: "per", href: "/client-portal/per", label: "PER 포인트", Icon: ShieldCheck },
  ].filter((item) => visibleMenus?.[item.key] !== false);

  return (
    <nav className="pcrm-portal-nav">
      {items.map(({ key, href, label, Icon }) => (
        <Link key={key} href={href} className={active === label ? "is-active" : ""}>
          <Icon size={15} strokeWidth={1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function PortalCard({ children, style, className = "" }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <section className={`pcrm-portal-card ${className}`} style={style}>
      {children}
    </section>
  );
}

export function PortalPageShell({
  session,
  active,
  children,
}: {
  session: {
    clientName: string;
    projectName?: string;
    managerName?: string;
    visibleMenus?: Record<string, boolean>;
  };
  active: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PortalHeader clientName={session.clientName} projectName={session.projectName} managerName={session.managerName} />
      <PortalNav active={active} visibleMenus={session.visibleMenus} />
      {children}
    </>
  );
}

export function PortalError({ message }: { message: string }) {
  return (
    <div className="pcrm-portal-state">
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
      <MessageSquareText size={32} />
      <h2>접근할 수 없습니다</h2>
      <p>{message}</p>
    </div>
  );
}

export function PortalLoading() {
  return (
    <div className="pcrm-portal-state">
      <img src="/assets/photoclinic-logo.png" alt="포토클리닉" />
      <div className="pcrm-portal-spinner" />
      <p>프로젝트 정보를 불러오고 있습니다.</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const completed = ["completed", "approved", "완료"].includes(status);
  const waiting = ["waiting", "pending", "active", "진행 중"].includes(status);
  const labels: Record<string, string> = {
    published: "확인 필요",
    viewed: "열람 완료",
    revision_requested: "수정 요청",
    approved: "승인 완료",
    completed: "완료",
    pending: "대기",
    active: "진행 중",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: R.full,
        padding: "4px 9px",
        background: completed ? `${C.success}15` : waiting ? `${C.orange}15` : `${C.teal}10`,
        color: completed ? C.success : waiting ? C.orange : C.teal,
        fontSize: 10,
        fontWeight: 900,
      }}
    >
      {labels[status] ?? status}
    </span>
  );
}
