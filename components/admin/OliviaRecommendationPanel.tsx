import { ArrowRight, Sparkles } from "lucide-react";

type OliviaRecommendationPanelProps = {
  items: string[];
};

export function OliviaRecommendationPanel({ items }: OliviaRecommendationPanelProps) {
  return (
    <section className="oa-recommendation" aria-labelledby="oa-recommendation-title">
      <div className="oa-recommendation__header">
        <span className="oa-recommendation__icon" aria-hidden="true"><Sparkles size={18} /></span>
        <div>
          <p className="oa-recommendation__eyebrow">OLIVIA AI</p>
          <h2 className="oa-recommendation__title" id="oa-recommendation-title">올리비아 추천 액션</h2>
        </div>
      </div>
      {items.length > 0 ? (
        <ol className="oa-recommendation__list">
          {items.map((item, index) => (
            <li className="oa-recommendation__item" key={`${index}-${item}`}>
              <span className="oa-recommendation__number" aria-hidden="true">{index + 1}</span>
              <span>{item}</span>
              <ArrowRight className="oa-recommendation__arrow" size={16} aria-hidden="true" />
            </li>
          ))}
        </ol>
      ) : (
        <p className="oa-recommendation__empty">현재 추천할 작업이 없습니다.</p>
      )}
    </section>
  );
}

export default OliviaRecommendationPanel;
