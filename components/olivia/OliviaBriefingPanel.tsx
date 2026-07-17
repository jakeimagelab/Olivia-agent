export default function OliviaBriefingPanel({ briefing }: { briefing: any }) {
  if (!briefing) return <div className="olivia-empty">아직 생성된 브리핑이 없습니다.</div>;
  return (
    <section className="olivia-briefing-panel">
      <div className="olivia-briefing-heading"><div><span>OLIVIA BRIEFING</span><h2>{briefing.title}</h2></div><time>{briefing.briefing_date}</time></div>
      <p>{briefing.summary}</p>
      <div className="olivia-briefing-sections">
        {(briefing.sections ?? []).map((section: any) => <div key={section.key}><strong>{section.title}</strong><b>{section.items?.length ?? 0}</b></div>)}
      </div>
    </section>
  );
}
