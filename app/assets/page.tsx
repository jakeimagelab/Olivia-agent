import Link from "next/link";
import { assets, hospitals } from "@/lib/subscription-data";

export default function AssetsPage() {
  return (
    <main className="ops-shell">
      <header className="ops-header">
        <Link href="/" className="pc-header-back">← 관리자 홈</Link>
        <p>Content Assets</p>
        <h1>콘텐츠 자산 보관함</h1>
        <span>촬영 사진과 영상 원본을 병원별, 카테고리별, 사용 채널별로 관리합니다.</span>
      </header>

      <section className="ops-filter-bar">
        <select defaultValue=""><option value="">전체 병원</option>{hospitals.map((h) => <option key={h.id}>{h.name}</option>)}</select>
        <select defaultValue=""><option value="">전체 카테고리</option><option>원장 프로필</option><option>의료진 프로필</option><option>진료 연출</option><option>상담 장면</option><option>장비 사진</option><option>병원 공간</option><option>직원/하모니컷</option><option>영상 원본</option><option>릴스 소스</option></select>
        <select defaultValue=""><option value="">전체 채널</option><option>인스타그램</option><option>블로그</option><option>네이버 플레이스</option><option>홈페이지</option><option>광고</option><option>내부 모니터</option></select>
      </section>

      <section className="ops-asset-grid">
        {assets.map((asset) => {
          const hospital = hospitals.find((item) => item.id === asset.hospitalId);
          return (
            <article key={asset.id} className="ops-asset-card">
              <img src={asset.fileUrl} alt="" />
              <div>
                <small>{hospital?.name} · {asset.category}</small>
                <h2>{asset.title}</h2>
                <p>{asset.channels.join(" / ")}</p>
                <div className="ops-chip-row">
                  <span>{asset.modelReleaseStatus}</span>
                  <span>{asset.used ? "사용 완료" : "사용 가능"}</span>
                  {asset.favorite ? <span>추천 자산</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
