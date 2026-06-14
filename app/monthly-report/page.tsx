"use client";

import Link from "next/link";
import { useState } from "react";
import { calendarItems, hospitals, reportItems } from "@/lib/subscription-data";

export default function MonthlyReportPage() {
  const [hospitalId, setHospitalId] = useState(hospitals[0].id);
  const [month, setMonth] = useState("2026-06");
  const hospital = hospitals.find((item) => item.id === hospitalId) || hospitals[0];
  const report = reportItems.find((item) => item.hospitalId === hospitalId) || reportItems[0];
  const items = calendarItems.filter((item) => item.hospitalId === hospitalId);

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <Link href="/" className="pc-header-back">← 관리자 홈</Link>
        <p>Monthly Report</p>
        <h1>월간 운영 리포트</h1>
        <span>구독 병원에 매달 제공할 콘텐츠 운영 결과와 다음 달 제안을 정리합니다.</span>
      </header>
      <section className="ops-filter-bar">
        <select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button>자동 리포트 생성</button>
        <button>PDF 다운로드</button>
        <button>이메일 발송</button>
      </section>
      <section className="report-preview">
        <div>
          <p>월간 포토클리닉 리포트</p>
          <h2>{hospital.name} · {month}</h2>
          <span>촬영 자산을 이번 달 홍보 콘텐츠로 전환한 결과입니다.</span>
        </div>
        <div className="subscription-stat-grid">
          <article className="subscription-stat-card"><span>제작 완료</span><strong>{report.completed}건</strong></article>
          <article className="subscription-stat-card"><span>검수 중</span><strong>{report.pending}건</strong></article>
          <article className="subscription-stat-card"><span>채널별 제작물</span><strong>{items.length}건</strong></article>
          <article className="subscription-stat-card"><span>발송 리포트</span><strong>{report.reportsSent}건</strong></article>
        </div>
        <section className="ops-panel">
          <h2>이번 달 제작 콘텐츠</h2>
          <div className="ops-list">{items.map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.channel} · {item.contentType} · {item.status}</span></div>)}</div>
        </section>
        <section className="ops-panel">
          <h2>포토클리닉 제안 코멘트</h2>
          <p className="ops-muted">다음 달에는 원장님의 상담 철학과 병원 공간의 신뢰감을 연결하는 콘텐츠를 강화하면 좋겠습니다. 네이버 플레이스에는 짧은 소식형 이미지와 CTA를 함께 배치해 예약 전환을 보완하세요.</p>
        </section>
        <section className="ops-panel">
          <h2>이메일 요약문</h2>
          <p className="ops-muted">안녕하세요, {hospital.name} 담당자님. {month} 월간 포토클리닉 운영 리포트를 공유드립니다. 이번 달 제작 완료 콘텐츠와 다음 달 추천 콘텐츠를 확인해 주세요.</p>
        </section>
      </section>
    </main>
  );
}
