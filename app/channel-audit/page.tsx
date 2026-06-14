"use client";

import Link from "next/link";
import { useState } from "react";
import { hospitals } from "@/lib/subscription-data";

const auditItems = ["최근 업로드 주기", "사진 퀄리티", "원장 이미지 노출", "의료진 소개", "진료 연출 이미지", "장비/공간 이미지", "환자 관점 FAQ", "검색형 콘텐츠", "CTA/예약 연결", "브랜드 톤 일관성"];

export default function ChannelAuditPage() {
  const [hospitalId, setHospitalId] = useState(hospitals[0].id);
  const hospital = hospitals.find((item) => item.id === hospitalId) || hospitals[0];
  const scores = [
    ["홈페이지", 78],
    ["인스타그램", 64],
    ["네이버 블로그", 52],
    ["네이버 플레이스", 70],
    ["유튜브", 28],
    ["카카오채널", 44]
  ];

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <Link href="/" className="pc-header-back">← 관리자 홈</Link>
        <p>Channel Audit</p>
        <h1>채널 진단 리포트</h1>
        <span>병원의 현재 홍보 채널을 점검하고 월간 구독 콘텐츠 제안으로 연결합니다.</span>
      </header>
      <section className="ops-two-column">
        <aside className="ops-panel">
          <h2>분석 대상</h2>
          <label className="field"><span>병원</span><select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>홈페이지 URL</span><input defaultValue={hospital.websiteUrl} /></label>
          <label className="field"><span>인스타그램 URL</span><input defaultValue={hospital.instagramUrl} /></label>
          <label className="field"><span>블로그 URL</span><input defaultValue={hospital.blogUrl} /></label>
          <label className="field"><span>네이버 플레이스 URL</span><input defaultValue={hospital.naverPlaceUrl} /></label>
          <label className="field"><span>기타 메모</span><textarea defaultValue="최근 사진 톤과 예약 전환 연결 상태를 우선 확인" /></label>
          <button className="admin-primary-button" type="button">채널 진단 생성</button>
        </aside>
        <section className="ops-panel">
          <h2>진단 결과</h2>
          <div className="score-grid">
            {scores.map(([label, score]) => <div key={label}><span>{label}</span><strong>{score}</strong></div>)}
          </div>
          <div className="ops-list">
            <div><strong>강점</strong><span>원장 프로필과 병원 공간 사진의 신뢰감이 좋습니다.</span></div>
            <div><strong>부족한 점</strong><span>검색형 블로그 콘텐츠와 네이버 플레이스 소식 업데이트가 부족합니다.</span></div>
            <div><strong>다음 달 추천 콘텐츠</strong><span>원장 철학 카드뉴스, 상담 장면 블로그, 플레이스 소식 2건</span></div>
            <div><strong>추가 촬영 추천 컷</strong><span>진료 전 상담 과정, 장비 설명 장면, 직원 하모니컷</span></div>
            <div><strong>구독 제안 문구</strong><span>월간 포토클리닉으로 촬영 자산을 매달 검색과 SNS 콘텐츠로 전환하세요.</span></div>
          </div>
          <div className="ops-chip-row">{auditItems.map((item) => <span key={item}>{item}</span>)}</div>
        </section>
      </section>
    </main>
  );
}
