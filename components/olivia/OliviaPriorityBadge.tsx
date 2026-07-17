export default function OliviaPriorityBadge({ score }: { score: number }) {
  const level = score >= 80 ? "urgent" : score >= 60 ? "high" : score >= 40 ? "normal" : "low";
  const label = level === "urgent" ? "긴급" : level === "high" ? "높음" : level === "normal" ? "보통" : "기록";
  return <span className={`olivia-priority olivia-priority--${level}`}>{label} · {score}</span>;
}
