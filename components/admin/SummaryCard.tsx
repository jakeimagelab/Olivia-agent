import type { ReactNode } from "react";

type SummaryCardProps = {
  label: string;
  value: ReactNode;
  description: string;
  icon: ReactNode;
  tone?: "blue" | "orange" | "green" | "red" | "gray";
};

export function SummaryCard({
  label,
  value,
  description,
  icon,
  tone = "blue",
}: SummaryCardProps) {
  return (
    <article className={`oa-summary-card oa-summary-card--${tone}`}>
      <div className="oa-summary-card__top">
        <span className="oa-summary-card__icon" aria-hidden="true">{icon}</span>
        <span className="oa-summary-card__label">{label}</span>
      </div>
      <strong className="oa-summary-card__value">{value}</strong>
      <p className="oa-summary-card__description">{description}</p>
    </article>
  );
}

export default SummaryCard;
