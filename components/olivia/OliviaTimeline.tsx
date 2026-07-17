export default function OliviaTimeline({ items }: { items: any[] }) {
  if (!items.length) return <div className="olivia-empty">표시할 실행 기록이 없습니다.</div>;
  return <div className="olivia-timeline">{items.map((item, index) => (
    <article key={`${item.id}-${index}`}><i/><div><span>{item.event_type || item.log_type || item.insight_type || item.action_type}</span><strong>{item.title || item.message || item.summary}</strong><small>{new Date(item.occurred_at || item.created_at || item.detected_at).toLocaleString("ko-KR")}</small></div></article>
  ))}</div>;
}
