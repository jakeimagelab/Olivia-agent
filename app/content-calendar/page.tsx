import { calendarItems, hospitals } from "@/lib/subscription-data";

export default function ContentCalendarPage() {
  return (
    <main className="ops-shell">
      <header className="ops-header">
        <p>Production Calendar</p>
        <h1>월간 납품 제작 캘린더</h1>
        <span>클라이언트 병원별로 한 달 동안 납품할 콘텐츠 제작 일정을 계획하고 진행 상태를 관리합니다.</span>
      </header>
      <section className="ops-filter-bar">
        <select defaultValue=""><option value="">전체 클라이언트</option>{hospitals.map((h) => <option key={h.id}>{h.name}</option>)}</select>
        <select defaultValue=""><option value="">전체 채널</option><option>Instagram</option><option>Blog</option><option>Naver Place</option><option>Homepage</option><option>Kakao Channel</option><option>Reels/Shorts</option></select>
        <button>이번 달 납품 일정 자동 추천</button>
        <button>다음 주 납품 예정 확인</button>
        <button>미납품 콘텐츠 확인</button>
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
