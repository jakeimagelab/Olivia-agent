"use client";

import { Building2, CircleDollarSign, TrendingUp, Users } from "lucide-react";
import { C, R } from "@/lib/theme";

type Hospital = {
  name: string;
  contractCount: number;
  contractAmount: number;
  quoteCount: number;
  pipelineAmount: number;
  lastContractAt: string | null;
};

type Summary = {
  totalRevenue: number;
  pipelineAmount: number;
  avgContractAmount: number;
  contractedHospitalCount: number;
  revenueThisMonth: number;
};

const cardStyle: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: R.lg,
  boxShadow: "0 5px 18px rgba(21,88,85,.055)",
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

export default function PcrmReportView({ summary, hospitals, loading }: { summary: Summary | null; hospitals: Hospital[]; loading: boolean }) {
  const cards = [
    { label: "전체 매출 (계약 기준)", value: summary ? won(summary.totalRevenue) : "—", Icon: CircleDollarSign, sub: summary ? `이번 달 +${won(summary.revenueThisMonth)}` : undefined },
    { label: "진행 중 견적 금액", value: summary ? won(summary.pipelineAmount) : "—", Icon: TrendingUp },
    { label: "평균 계약 금액", value: summary ? won(summary.avgContractAmount) : "—", Icon: Building2 },
    { label: "계약 고객 수", value: summary ? `${summary.contractedHospitalCount}곳` : "—", Icon: Users },
  ];

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>통계 / 보고서</h1>
        </div>
      </div>

      <section className="pcrm-report-summary-grid" aria-label="매출 요약">
        {cards.map(({ label, value, Icon, sub }) => (
          <article key={label} style={cardStyle}>
            <Icon size={25} strokeWidth={1.7} />
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              {sub && <small>{sub}</small>}
            </div>
          </article>
        ))}
      </section>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>병원별 계약 현황</h2><span>계약 금액이 큰 순서로 정렬됩니다.</span></div>
          <b>{hospitals.length}개 병원</b>
        </header>
        <div className="pcrm-project-table pcrm-report-table">
          <div className="pcrm-project-row pcrm-project-row--head">
            <span>병원명</span><span>계약 건수</span><span>계약 금액</span><span>진행 중 견적</span><span>최근 계약일</span>
          </div>
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : hospitals.length === 0 ? (
            <p className="pcrm-empty-copy">집계할 데이터가 없습니다.</p>
          ) : hospitals.map((h) => (
            <div key={h.name} className="pcrm-project-row" style={{ cursor: "default" }}>
              <span><Building2 size={15} />{h.name}</span>
              <span>{h.contractCount}건</span>
              <span>{won(h.contractAmount)}</span>
              <span>{h.pipelineAmount > 0 ? won(h.pipelineAmount) : "—"}</span>
              <span>{formatDate(h.lastContractAt)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}
