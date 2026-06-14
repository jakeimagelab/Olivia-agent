"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  BarChart2,
  CalendarDays,
  ClipboardList,
  Database,
  FileText,
  FileVideo,
  Globe2,
  ImageDown,
  Images,
  LayoutGrid,
  LockKeyhole,
  LogOut,
  Mail,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
  Wand2
} from "lucide-react";

const dashboardStats = [
  { label: "이번 달 구독 병원", value: "18곳" },
  { label: "제작 예정 콘텐츠", value: "146건" },
  { label: "검수 대기 콘텐츠", value: "23건" },
  { label: "발송 리포트", value: "12건" }
];

const primaryMenus = [
  {
    title: "월간 포토클리닉",
    description: "월 50만원 구독 병원의 이번 달 콘텐츠 운영 현황을 확인합니다.",
    href: "/monthly-report",
    icon: Megaphone,
    meta: "Monthly Photoclinic"
  },
  {
    title: "병원 구독 관리",
    description: "구독 병원, 담당자, 월 제공 수량, 상태와 계약 메모를 관리합니다.",
    href: "/subscription",
    icon: Users,
    meta: "Subscription"
  },
  {
    title: "콘텐츠 자산 보관함",
    description: "촬영 사진과 영상 소스를 병원별, 채널별, 카테고리별로 정리합니다.",
    href: "/assets",
    icon: Database,
    meta: "Assets"
  },
  {
    title: "콘텐츠 캘린더",
    description: "구독 병원의 월간 SNS, 블로그, 플레이스 콘텐츠 일정을 관리합니다.",
    href: "/content-calendar",
    icon: CalendarDays,
    meta: "Calendar"
  },
  {
    title: "SNS 디자인 생성",
    description: "촬영 자산으로 카드뉴스, 릴스 썸네일, 플레이스 이미지를 만듭니다.",
    href: "/sns-design",
    icon: LayoutGrid,
    meta: "SNS Design"
  },
  {
    title: "블로그/플레이스 콘텐츠",
    description: "사진과 주제를 바탕으로 블로그, 플레이스, 캡션 초안을 생성합니다.",
    href: "/content-writer",
    icon: FileText,
    meta: "Content Writer"
  },
  {
    title: "채널 진단 리포트",
    description: "홈페이지, 인스타그램, 블로그, 플레이스 운영 상태를 진단합니다.",
    href: "/channel-audit",
    icon: Activity,
    meta: "Channel Audit"
  },
  {
    title: "월간 운영 리포트",
    description: "이번 달 제작물, 부족한 콘텐츠, 다음 달 추천안을 리포트로 정리합니다.",
    href: "/monthly-report",
    icon: BarChart2,
    meta: "Monthly Report"
  }
];

const legacyMenus = [
  { title: "견적서", description: "촬영 패키지와 옵션 견적서를 생성합니다.", href: "/quote", icon: ClipboardList, meta: "Quote" },
  { title: "병원이미지 진단", description: "현재 사진 콘텐츠 방향을 진단합니다.", href: "/diagnosis", icon: ImageDown, meta: "Diagnosis" },
  { title: "촬영 콘티", description: "촬영 콘티, 체크리스트, 타임테이블을 만듭니다.", href: "/conti", icon: FileVideo, meta: "Conti" },
  { title: "파일 전송", description: "NAS 링크를 포토클리닉 브랜드 메일로 전송합니다.", href: "/delivery-mail", icon: Mail, meta: "Delivery" },
  { title: "홈페이지 제작", description: "병원 홈페이지 제작 요청과 기획 정보를 정리합니다.", href: "/website-builder", icon: Globe2, meta: "Website" },
  { title: "사진 분류", description: "촬영 사진을 용도와 카테고리별로 분류합니다.", href: "/photo-sorting", icon: Images, meta: "Sorting" },
  { title: "AI 이미지 생성", description: "포토클리닉 톤의 보조 이미지를 생성합니다.", href: "/image-generator", icon: Sparkles, meta: "Image" },
  { title: "사진 보정", description: "보정 워크플로와 Evoto 연동을 준비합니다.", href: "/photo-retouching", icon: Wand2, meta: "Retouching" }
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

  if (!isReady) {
    return <main className="admin-shell"><div className="admin-loading" /></main>;
  }

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
            <p className="login-copy">
              촬영한 사진과 영상을 매달 병원 홍보 콘텐츠로 전환하는 포토클리닉 운영 시스템입니다.
            </p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>관리자 비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="ADMIN_PASSWORD"
                autoComplete="current-password"
              />
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
    <main className="admin-shell">
      <section className="admin-dashboard" aria-labelledby="dashboard-title">
        <header className="admin-dashboard-header">
          <div className="brand-lockup">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" />
            <span>PHOTOCLINIC SUBSCRIPTION</span>
          </div>
          <button className="admin-logout-button" type="button" onClick={handleLogout}>
            <LogOut size={17} />
            로그아웃
          </button>
        </header>

        <div className="subscription-hero">
          <p className="admin-kicker">월간 포토클리닉 · 구독 콘텐츠 운영</p>
          <h1 id="dashboard-title">포토클리닉 구독 콘텐츠 운영</h1>
          <p>촬영한 사진과 영상을 매달 병원 홍보 콘텐츠로 전환합니다.</p>
        </div>

        <div className="subscription-stat-grid">
          {dashboardStats.map((stat) => (
            <article key={stat.label} className="subscription-stat-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </article>
          ))}
        </div>

        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h2>구독 운영 메뉴</h2>
            <p>병원별 월간 콘텐츠 제작, 검수, 리포트까지 한 흐름으로 관리합니다.</p>
          </div>
          <div className="admin-menu-grid">
            {primaryMenus.map((item) => <DashboardCard key={item.title} item={item} />)}
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section-head">
            <h2>기존 촬영 업무</h2>
            <p>단발 촬영과 제작 보조 기능은 유지하되, 구독 운영 흐름 안에서 활용합니다.</p>
          </div>
          <div className="admin-menu-grid compact">
            {legacyMenus.map((item) => <DashboardCard key={item.title} item={item} />)}
          </div>
        </section>

        <footer className="admin-status-strip">
          <ShieldCheck size={18} />
          <span>관리자 세션이 활성화되어 있습니다.</span>
        </footer>
      </section>
    </main>
  );
}

function DashboardCard({ item }: { item: typeof primaryMenus[number] }) {
  const Icon = item.icon;
  return (
    <Link className="admin-menu-card" href={item.href}>
      <div className="admin-menu-icon">
        <Icon size={26} />
      </div>
      <div className="admin-menu-copy">
        <span>{item.meta}</span>
        <h2>{item.title}</h2>
        <p>{item.description}</p>
      </div>
      <div className="admin-menu-action" aria-hidden="true">
        <ArrowRight size={21} />
      </div>
    </Link>
  );
}
