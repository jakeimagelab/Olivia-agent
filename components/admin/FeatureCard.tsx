import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import StatusBadge from "./StatusBadge";

type FeatureCardProps = {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  tags?: string[];
  status?: string;
};

export function FeatureCard({ title, description, href, icon, tags = [], status }: FeatureCardProps) {
  return (
    <article className="oa-feature-card">
      <div className="oa-feature-card__top">
        <span className="oa-feature-card__icon" aria-hidden="true">{icon}</span>
        {status && <StatusBadge tone="green">{status}</StatusBadge>}
      </div>
      <div className="oa-feature-card__body">
        <h2 className="oa-feature-card__title">{title}</h2>
        <p className="oa-feature-card__description">{description}</p>
      </div>
      <div className="oa-feature-card__footer">
        {tags.length > 0 && (
          <ul className="oa-feature-card__tags" aria-label="기능 분류">
            {tags.map((tag) => <li className="oa-feature-card__tag" key={tag}>{tag}</li>)}
          </ul>
        )}
        <Link className="oa-feature-card__link" href={href} aria-label={`${title} 열기`}>
          열기 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export default FeatureCard;
