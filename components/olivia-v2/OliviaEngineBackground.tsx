// 포토클리닉 로고(조리개 링 + 셔터 블레이드)를 모티프로 한 배경 장식 — Phase 6.
// idle일 때는 아주 느리게, 스트리밍 중일 때만 살짝 빨라지고 밝아진다. 순수 SVG+CSS 애니메이션이라
// 채팅이 계속 리렌더돼도 레이아웃/JS 비용이 없다.
export default function OliviaEngineBackground({ active }: { active: boolean }) {
  return (
    <div className="olivia-engine-bg" data-active={active} aria-hidden="true">
      <svg viewBox="0 0 200 200" className="olivia-engine-bg__svg">
        <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="1.2" className="olivia-engine-bg__ring-outer" />
        <g className="olivia-engine-bg__blades">
          {Array.from({ length: 8 }).map((_, index) => (
            <line
              key={index}
              x1="100" y1="30" x2="100" y2="56"
              stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
              transform={`rotate(${index * 45} 100 100)`}
            />
          ))}
        </g>
        <circle cx="100" cy="100" r="58" fill="none" stroke="currentColor" strokeWidth="1" className="olivia-engine-bg__ring-inner" />
        <circle cx="100" cy="100" r="14" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
