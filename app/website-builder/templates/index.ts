export { classicTemplate } from "./classic";
export { premiumTemplate } from "./premium";
export { warmTemplate } from "./warm";
export { medihomeTemplate } from "./medihome";
export type { SiteTemplate, TemplateRenderData, TemplateContent, TemplateTheme, TemplateIntake } from "./types";

import { classicTemplate } from "./classic";
import { premiumTemplate } from "./premium";
import { warmTemplate } from "./warm";
import { medihomeTemplate } from "./medihome";
import type { SiteTemplate } from "./types";

// 템플릿 추가 시 여기에만 등록하면 자동으로 전체 반영됩니다
export const TEMPLATES: SiteTemplate[] = [
  classicTemplate,
  premiumTemplate,
  warmTemplate,
  medihomeTemplate,
];

export function getTemplateById(id: string): SiteTemplate {
  return TEMPLATES.find(t => t.id === id) ?? classicTemplate;
}
