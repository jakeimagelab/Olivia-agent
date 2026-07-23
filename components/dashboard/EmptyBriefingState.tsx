import Link from "next/link";

export default function EmptyBriefingState() {
  return (
    <div className="home-briefing-empty">
      <p>오늘 반드시 처리해야 할 업무가 없습니다.</p>
      <span>새 할 일을 등록하거나 전체 업무를 확인해보세요.</span>
      <div>
        <Link href="/calendar">할 일 추가</Link>
        <Link href="/workflow/tasks">전체 업무 보기</Link>
      </div>
    </div>
  );
}
