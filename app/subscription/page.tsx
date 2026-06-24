import Link from "next/link";
import { hospitals } from "@/lib/subscription-data";

const statusLabel: Record<string, string> = {
  active: "운영중",
  paused: "일시중지",
  canceled: "해지"
};

export default function SubscriptionPage() {
  return (
    <main className="ops-shell">
      <OpsHeader eyebrow="Subscription" title="병원 구독 관리" description="월간 포토클리닉 구독 병원의 상태, 제공 수량, 계약 메모를 관리합니다." />
      <section className="ops-table-card">
        <div className="ops-table-head">
          <span>병원</span><span>담당자</span><span>구독 시작</span><span>월 구독료</span><span>이번 달</span><span>상태</span>
        </div>
        {hospitals.map((hospital) => (
          <Link key={hospital.id} href={`/subscription/${hospital.id}`} className="ops-table-row">
            <strong>{hospital.name}<small>{hospital.email}</small></strong>
            <span>{hospital.managerName}<small>{hospital.phone}</small></span>
            <span>{hospital.startDate}</span>
            <span>{hospital.monthlyPrice.toLocaleString()}원</span>
            <span>{hospital.quota - hospital.remaining}/{hospital.quota} 제작</span>
            <b className={`status-pill ${hospital.status}`}>{statusLabel[hospital.status]}</b>
          </Link>
        ))}
      </section>
    </main>
  );
}

function OpsHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="ops-header">
      <Link href="/" className="pc-header-back">← 관리자 홈</Link>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </header>
  );
}
