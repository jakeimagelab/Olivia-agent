import type { ReactNode } from "react";

type CategorySectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function CategorySection({ eyebrow, title, description, action, children }: CategorySectionProps) {
  return (
    <section className="oa-category-section">
      <div className="oa-category-section__header">
        <div className="oa-category-section__heading">
          {eyebrow && <p className="oa-category-section__eyebrow">{eyebrow}</p>}
          <h2 className="oa-category-section__title">{title}</h2>
          {description && <p className="oa-category-section__description">{description}</p>}
        </div>
        {action && <div className="oa-category-section__action">{action}</div>}
      </div>
      <div className="oa-category-section__content">{children}</div>
    </section>
  );
}

export default CategorySection;
