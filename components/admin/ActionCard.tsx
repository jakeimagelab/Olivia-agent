import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import StatusBadge from "./StatusBadge";

type ActionCardProps = {
  title: string;
  description: string;
  meta?: string;
  href?: string;
  status?: string;
};

export function ActionCard({ title, description, meta, href, status }: ActionCardProps) {
  const content = (
    <>
      <div className="oa-action-card__content">
        <div className="oa-action-card__heading">
          <h3 className="oa-action-card__title">{title}</h3>
          {status && <StatusBadge tone="orange">{status}</StatusBadge>}
        </div>
        <p className="oa-action-card__description">{description}</p>
        {meta && <span className="oa-action-card__meta">{meta}</span>}
      </div>
      {href && <ArrowUpRight className="oa-action-card__arrow" size={18} aria-hidden="true" />}
    </>
  );

  return href ? (
    <Link className="oa-action-card oa-action-card--link" href={href} aria-label={`${title} 열기`}>
      {content}
    </Link>
  ) : (
    <article className="oa-action-card">{content}</article>
  );
}

export default ActionCard;
