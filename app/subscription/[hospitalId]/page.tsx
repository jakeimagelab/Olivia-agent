import Link from "next/link";
import { assets, calendarItems, getHospital, reportItems } from "@/lib/subscription-data";

export default function HospitalDetailPage({ params }: { params: any }) {
  const hospital = getHospital(params.hospitalId);
  const hospitalAssets = assets.filter((asset) => asset.hospitalId === hospital.id);
  const hospitalCalendar = calendarItems.filter((item) => item.hospitalId === hospital.id);
  const report = reportItems.find((item) => item.hospitalId === hospital.id);

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <Link href="/subscription" className="pc-header-back">← 구독 관리</Link>
        <p>Hospital Detail</p>
        <h1>{hospital.name}</h1>
        <span>{hospital.memo}</span>
      </header>

      <section className="ops-summary-grid">
        <InfoCard label="구독 상태" value={hospital.status} />
        <InfoCard label="월간 제공 범위" value={`${hospital.quota}건 / 월`} />
        <InfoCard label="남은 제작 수량" value={`${hospital.remaining}건`} />
        <InfoCard label="발송 리포트" value={`${report?.reportsSent || 0}건`} />
      </section>

      <section className="ops-two-column">
        <article className="ops-panel">
          <h2>업로드된 사진/영상 자산</h2>
          <div className="ops-asset-list">
            {hospitalAssets.map((asset) => (
              <div key={asset.id}>
                <img src={asset.fileUrl} alt="" />
                <strong>{asset.title}</strong>
                <span>{asset.category} · {asset.channels.join(", ")}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="ops-panel">
          <h2>이번 달 콘텐츠 캘린더</h2>
          <div className="ops-list">
            {hospitalCalendar.map((item) => (
              <div key={item.id}>
                <strong>{item.date} · {item.title}</strong>
                <span>{item.channel} / {item.contentType} / {item.status}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="ops-panel">
        <h2>다음 달 추천 콘텐츠</h2>
        <div className="ops-chip-row">
          <span>원장 상담 철학 카드뉴스</span>
          <span>병원 공간 릴스 썸네일</span>
          <span>네이버 플레이스 소식 2건</span>
          <span>블로그 검색형 글 1건</span>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return <article className="subscription-stat-card"><span>{label}</span><strong>{value}</strong></article>;
}
