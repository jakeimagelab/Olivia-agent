// ─── Template System Types ────────────────────────────────────────────────────

export interface TemplateTheme {
  primary: string;
  accent: string;
  bg: string;
  textColor: string;
}

export interface TemplateContent {
  hero: { headline: string; subline: string; cta: string };
  about: { title: string; body: string };
  services: { name: string; desc: string }[];
  doctors: { name: string; title: string; bio: string }[];
  notice: { title: string; body: string };
  location: { address: string; hours: string; parking: string };
  footer: { copy: string; tagline: string };
  keywords?: string[];
}

export interface TemplateIntake {
  hospitalName: string;
  phone?: string;
  address?: string;
  specialties?: string;
}

export interface TemplateRenderData {
  intake: TemplateIntake;
  content: TemplateContent;
  theme: TemplateTheme;
}

export interface SiteTemplate {
  id: string;
  name: string;
  desc: string;
  tag: string;
  tagColor: string;
  previewBg: string;   // card 배경색 (미리보기용)
  previewLines: string[]; // 스켈레톤 라인 색상들
  render: (data: TemplateRenderData) => string;
}
