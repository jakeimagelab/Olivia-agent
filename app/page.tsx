"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseMedical,
  Building2,
  CalendarDays,
  Camera,
  ClipboardList,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  Grid2X2,
  Hospital,
  ImageDown,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Mail,
  PenLine,
  Send,
  Sparkles,
  Wand2
} from "lucide-react";

const stats = [
  { label: "이번 달 구독 병원", value: "18", unit: "곳", note: "전체 24곳", icon: Building2, tone: "green" },
  { label: "제작 예정 콘텐츠", value: "146", unit: "건", note: "이번 달 캘린더 기준", icon: FileText, tone: "green" },
  { label: "검수 대기 콘텐츠", value: "23", unit: "건", note: "병원 검수 대기 중", icon: Activity, tone: "orange" },
  { label: "발송 리포트", value: "12", unit: "건", note: "이번 달 발송 완료", icon: Send, tone: "orange" }
];

const mainMenus = [
  { title: "월간 포토클리닉", description: "촬영부터 콘텐츠 제작까지 월간 구독 서비스 운영을 한눈에 관리합니다.", href: "/monthly-report", icon: Camera, accent: "green" },
  { title: "병원 구독 관리", description: "구독 중인 병원 정보, 계약 현황, 제공 범위와 진행 상황을 관리합니다.", href: "/subscription", icon: Hospital, accent: "green" },
  { title: "콘텐츠 자산 보관함", description: "촬영한 사진과 영상 자산을 병원별, 카테고리별로 정리하고 재활용합니다.", href: "/assets", icon: FolderOpen, accent: "green" },
  { title: "콘텐츠 캘린더", description: "병원별 월간 콘텐츠 일정을 계획하고 제작·발행 현황을 관리합니다.", href: "/content-calendar", icon: CalendarDays, accent: "green" },
  { title: "SNS 디자인 생성", description: "촬영 사진을 활용해 인스타그램, 릴스, 네이버 플레이스용 디자인을 생성합니다.", href: "/sns-design", icon: LayoutGrid, accent: "orange" },
  { title: "블로그/플레이스 콘텐츠", description: "블로그 글, 네이버 플레이스 소식 등 검색 최적화 콘텐츠를 자동 생성합니다.", href: "/content-writer", icon: PenLine, accent: "orange" },
  { title: "채널 진단", description: "병원의 홈페이지, SNS, 블로그 채널을 진단하고 개선 제안을 제공합니다.", href: "/channel-audit", icon: BarChart3, accent: "orange" },
  { title: "월간 리포트", description: "월간 제작 콘텐츠, 채널 성과, 개선 제안을 정리해 리포트를 발송합니다.", href: "/monthly-report", icon: FileImage, accent: "orange" }
];

const sideMain = [
  { label: "대시보드", href: "/", icon: Grid2X2 },
  { label: "월간 포토클리닉", href: "/monthly-report", icon: Camera },
  { label: "병원 구독 관리", href: "/subscription", icon: Hospital },
  { label: "콘텐츠 자산 보관함", href: "/assets", icon: FolderOpen },
  { label: "콘텐츠 캘린더", href: "/content-calendar", icon: CalendarDays },
  { label: "SNS 디자인 생성", href: "/sns-design", icon: LayoutGrid },
  { label: "블로그/플레이스 콘텐츠", href: "/content-writer", icon: Mail },
  { label: "채널 진단", href: "/channel-audit", icon: BarChart3 },
  { label: "월간 리포트", href: "/monthly-report", icon: FileImage }
];

const sideLegacy = [
  { label: "견적서 생성", href: "/quote", icon: ClipboardList },
  { label: "병원이미지 진단", href: "/diagnosis", icon: ImageDown },
  { label: "촬영 콘티 생성", href: "/conti", icon: FileVideo },
  { label: "파일 전송 메일", href: "/delivery-mail", icon: Mail },
  { label: "홈페이지 제작", href: "/website-builder", icon: BriefcaseMedical },
  { label: "사진 분류 시스템", href: "/photo-sorting", icon: FolderOpen },
  { label: "AI 이미지 생성기", href: "/image-generator", icon: Sparkles },
  { label: "사진 보정", href: "/photo-retouching", icon: Wand2 }
];

const activities = [
  "온유성형외과 콘텐츠 4건 제작 완료",
  "바른이치과 블로그 글 2건 검수 요청",
  "라온피부과 월간 리포트 발송 완료"
];

export default function AdminHome() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/auth/check")
      .then((res) => res.json())
      .then((data) => setIsAuthenticated(Boolean(data.authenticated)))
      .finally(() => setIsReady(true));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!data.ok) {
      setErrorMessage(data.error || "로그인에 실패했습니다.");
      return;
    }
    setIsAuthenticated(true);
    setPassword("");
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setIsAuthenticated(false);
  };

  if (!isReady) return <main className="admin-shell"><div className="admin-loading" /></main>;

  if (!isAuthenticated) {
    return (
      <main className="admin-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="brand-lockup">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" />
            <span>Monthly Console</span>
          </div>
          <div>
            <p className="admin-kicker">월간 포토클리닉</p>
            <h1 id="login-title">구독 콘텐츠 운영 관리자</h1>
            <p className="login-copy">촬영한 사진과 영상을 매달 병원 홍보 콘텐츠로 전환하는 운영 시스템입니다.</p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>관리자 비밀번호</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="ADMIN_PASSWORD" autoComplete="current-password" />
            </label>
            {errorMessage ? <p className="login-error">{errorMessage}</p> : null}
            <button className="admin-primary-button" type="submit">
              <LockKeyhole size={18} />
              로그인
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="pc-console">
      <aside className="pc-sidebar">
        <div className="pc-sidebar-brand">
          <div className="pc-brand-mark"><Camera size={27} /></div>
          <div>
            <strong>PHOTOCLINIC</strong>
            <span>포토클리닉</span>
          </div>
        </div>

        <nav className="pc-nav">
          {sideMain.map((item, index) => <SideLink key={`${item.href}-${item.label}`} item={item} active={index === 0} />)}
        </nav>

        <div className="pc-nav-section">
          <span>기타 기능</span>
        </div>
        <nav className="pc-nav pc-nav-legacy">
          {sideLegacy.map((item) => <SideLink key={`${item.href}-${item.label}`} item={item} />)}
        </nav>

        <div className="pc-sidebar-user">
          <div className="pc-avatar">●</div>
          <div>
            <strong>포토클리닉 관리자</strong>
            <span>관리자</span>
          </div>
        </div>
      </aside>

      <section className="pc-main">
        <header className="pc-topbar">
          <div />
          <div className="pc-top-actions">
            <button className="pc-icon-button" type="button" aria-label="알림">
              <Bell size={22} />
              <span>3</span>
            </button>
            <button className="pc-logout-link" type="button" onClick={handleLogout}>
              <LogOut size={20} />
              로그아웃
            </button>
          </div>
        </header>

        <section className="pc-hero">
          <h1>포토클리닉 구독 콘텐츠 운영</h1>
          <p>촬영한 사진과 영상을 매달 병원 홍보 콘텐츠로 전환합니다.</p>
        </section>

        <section className="pc-stat-grid">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <article key={stat.label} className="pc-stat-card">
                <div className={`pc-stat-icon ${stat.tone}`}><Icon size={34} /></div>
                <div>
                  <span>{stat.label}</span>
                  <strong>{stat.value}<small>{stat.unit}</small></strong>
                  <p>{stat.note}</p>
                </div>
              </article>
            );
          })}
        </section>

        <section className="pc-card-grid">
          {mainMenus.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} className={`pc-menu-card ${item.accent}`} href={item.href}>
                <div className="pc-menu-icon"><Icon size={28} /></div>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                </div>
                <span className="pc-card-arrow"><ArrowRight size={24} /></span>
              </Link>
            );
          })}
        </section>

        <section className="pc-activity-strip">
          <div className="pc-activity-title">
            <Activity size={28} />
            <strong>최근 활동</strong>
          </div>
          <div className="pc-activity-list">
            {activities.map((activity, index) => (
              <div key={activity}>
                <span />
                <p>{activity}<small>{index === 0 ? "2시간 전" : index === 1 ? "4시간 전" : "1일 전"}</small></p>
              </div>
            ))}
          </div>
          <Link className="pc-activity-more" href="/report">전체 활동 보기 <ArrowRight size={18} /></Link>
        </section>
      </section>
    </main>
  );
}

function SideLink({ item, active = false }: { item: { label: string; href: string; icon: any }; active?: boolean }) {
  const Icon = item.icon;
  return (
    <Link className={active ? "pc-nav-link active" : "pc-nav-link"} href={item.href}>
      <Icon size={22} />
      <span>{item.label}</span>
    </Link>
  );
}
