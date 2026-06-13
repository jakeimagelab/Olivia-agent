"use client";

import Link from "next/link";
import OliviaChat from "@/components/OliviaChat";
import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  BarChart2,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  FileVideo,
  Globe2,
  ImageDown,
  Images,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Wand2
} from "lucide-react";

const ADMIN_PASSWORD = "Dush3928^^00";

const adminMenus = [
  {
    title: "견적서 생성",
    description: "촬영 패키지와 옵션을 선택해 견적서 PDF를 생성합니다.",
    href: "/quote",
    icon: ClipboardList,
    meta: "Quote Builder"
  },
  {
    title: "병원이미지 진단",
    description: "병원의 현재 상황에 맞는 사진 콘텐츠 방향을 진단합니다.",
    href: "/diagnosis",
    icon: ImageDown,
    meta: "Clinic Diagnosis"
  },
  {
    title: "병원 채널 분석",
    description: "인스타그램, 홈페이지, 네이버 플레이스, 블로그를 함께 분석합니다.",
    href: "/channel-analyzer",
    icon: Activity,
    meta: "Channel Analysis"
  },
  {
    title: "SNS 콘텐츠 매니저",
    description: "블로그 포스팅 자동 생성, 인스타그램 캡션, 네이버 플레이스 관리를 한 곳에서.",
    href: "/sns-manager",
    icon: CalendarCheck,
    meta: "SNS Manager"
  },

  {
    title: "사진 분류 시스템",
    description: "촬영 사진을 용도와 카테고리별로 빠르게 분류하고 정리합니다.",
    href: "/photo-sorting",
    icon: Images,
    meta: "Photo Sorting"
  },
  {
    title: "촬영 콘티 생성",
    description: "병원 정보 입력 시 AI가 촬영 콘티·체크리스트·타임테이블을 자동 생성합니다.",
    href: "/conti",
    icon: FileVideo,
    meta: "Conti Generator"
  },
  {
    title: "홈페이지 제작",
    description: "병원 홈페이지 제작 요청과 기획 정보를 정리합니다.",
    href: "/website-builder",
    icon: Globe2,
    meta: "Website Builder"
  },
  {
    title: "사진 보정",
    description: "Evoto 연동 가능성을 확인하고 보정 워크플로를 준비합니다.",
    href: "/photo-retouching",
    icon: Wand2,
    meta: "Photo Retouching"
  },
  {
    title: "AI 이미지 생성기",
    description: "장면과 인물을 세세하게 입력해 포토클리닉 사진 톤의 AI 이미지를 생성합니다.",
    href: "/image-generator",
    icon: Sparkles,
    meta: "AI Image Generator"
  },
  {
    title: "파일 전송 메일",
    description: "촬영 완료 후 NAS 링크를 병원에 포토클리닉 브랜드 메일로 바로 전송합니다.",
    href: "/delivery-mail",
    icon: Mail,
    meta: "File Transfer"
  },
  {
    title: "업무 리포트",
    description: "올리비아 AI 활동 기록, 병원별 통계, 일별 차트를 한눈에 확인합니다.",
    href: "/report",
    icon: BarChart2,
    meta: "Weekly Report"
  }
];

function OliviaGreeting() {
  const full = "안녕하세요, 정연호 대표님. 포토클리닉 AI 비서 올리비아입니다. 무엇을 도와드릴까요?";
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(full.slice(0, i));
      if (i >= full.length) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, []); // ← 빈 배열: 마운트 시 1회만 실행

  return (
    <div style={{
      background: "linear-gradient(135deg, #155855 0%, #1C3F3C 100%)",
      borderRadius: "14px",
      padding: "18px 22px",
      margin: "16px 0",
      display: "flex",
      alignItems: "flex-start",
      gap: "14px",
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: "50%",
        background: "linear-gradient(135deg, #E85D2C, #EB8F22)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0, boxShadow: "0 2px 8px rgba(232,93,44,.4)"
      }}>
        ✨
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.5)",
                      letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 5 }}>
          OLIVIA · AI 비서
        </div>
        <p style={{ fontSize: 15, color: "#fff", lineHeight: 1.6, margin: 0, minHeight: 24 }}>
          {displayed}
          {displayed.length < full.length && (
            <span style={{ display: "inline-block", width: 2, height: "1em",
                           background: "#EB8F22", marginLeft: 2, verticalAlign: "text-bottom",
                           animation: "blink 1s step-end infinite" }} />
          )}
        </p>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

export default function AdminHome() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setErrorMessage("");
      setPassword("");
      return;
    }

    setErrorMessage("비밀번호를 다시 확인해주세요.");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <main className="admin-shell">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="brand-lockup">
            <img
              src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
              alt="포토클리닉"
            />
            <span>Admin Console</span>
          </div>
          <div>
            <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
            <h1 id="login-title">포토클리닉 AI 비서 관리자</h1>
            <p className="login-copy">
              관리자 비밀번호를 입력하면 견적서, 병원이미지 진단, 병원 채널 분석, 홍보 디자인, 사진 분류, 홈페이지 제작, 사진 보정으로 바로 이동할 수 있습니다.
            </p>
          </div>
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="관리자 비밀번호"
                autoComplete="off"
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
            <img
              src="https://photoclinic-diangnoisis.vercel.app/logo.svg"
              alt="포토클리닉"
            />
            <span>AI Assistant</span>
          </div>
          <button className="admin-logout-button" type="button" onClick={handleLogout}>
            <LogOut size={17} />
            로그아웃
          </button>
        </header>

        <div className="dashboard-hero">
          <p className="admin-kicker">병원 • 메디컬 성장 플랫폼</p>
          <h1 id="dashboard-title">포토클리닉 AI 비서 관리자</h1>
          <OliviaGreeting />
          <p>
            상담부터 진단, 채널 분석, 홍보 디자인, 사진 분류, 홈페이지 제작, 사진 보정까지 한 화면에서 시작하세요. 필요한 업무를 선택하면 해당 페이지로 바로 이동합니다.
          </p>
        </div>

        <div className="admin-menu-grid">
          {adminMenus.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.title} className="admin-menu-card" href={item.href}>
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
          })}
        </div>

        <OliviaChat />
        <footer className="admin-status-strip">
          <ShieldCheck size={18} />
          <span>관리자 세션이 활성화되어 있습니다.</span>
        </footer>
      </section>
    </main>
  );
}
