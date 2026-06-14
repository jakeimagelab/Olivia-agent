import Link from "next/link";
import { calendarItems, hospitals } from "@/lib/subscription-data";

export default function ContentCalendarPage() {
  return (
    <main className="ops-shell">
      <header className="ops-header">
        <Link href="/" className="pc-header-back">← 관리자 홈</Link>
        <p>Monthly Calendar</p>
        <h1>월간 콘텐츠 캘린더</h1>
        <span>구독 병원별로 한 달 동안 제작할 홍보 콘텐츠를 계획하고 상태를 관리합니다.</span>
      </header>
      <section className="ops-filter-bar">
        <select defaultValue=""><option value="">전체 병원</option>{hospitals.map((h) => <option key={h.id}>{h.name}</option>)}</select>
        <select defaultValue=""><option value="">전체 채널</option><option>Instagram</option><option>Blog</option><option>Naver Place</option><option>Homepage</option><option>Kakao Channel</option><option>Reels/Shorts</option></select>
        <button>이번 달 콘텐츠 자동 추천</button>
        <button>다음 주 발행 콘텐츠 추천</button>
        <button>부족한 콘텐츠 추천</button>
      </section>
      <section className="calendar-board">
        {calendarItems.map((item) => {
          const hospital = hospitals.find((h) => h.id === item.hospitalId);
          return (
            <article key={item.id} className="calendar-card">
              <span>{item.date}</span>
              <strong>{item.title}</strong>
              <p>{hospital?.name} · {item.channel} · {item.contentType}</p>
              <b>{item.status}</b>
            </article>
          );
        })}
      </section>
    </main>
  );
}
