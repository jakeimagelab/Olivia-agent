import type { SiteTemplate, TemplateRenderData } from "./types";
import { getInjectScript } from "./inject";

// ─── Template 1: 클래식 ────────────────────────────────────────────────────────
// 깔끔하고 균형 잡힌 표준 병원 레이아웃. 헤더·섹션 분리 명확.

export const classicTemplate: SiteTemplate = {
  id: "classic",
  name: "클래식",
  desc: "가장 많이 쓰이는 병원 홈페이지 표준 레이아웃",
  tag: "범용",
  tagColor: "#155855",
  previewBg: "#f0f7f5",
  previewLines: ["#155855", "#E85D2C", "#e8e3db"],

  render: (data: TemplateRenderData) => {
    const { intake, content, theme, editMode } = data;
    const grad = `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 100%)`;
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${intake.hospitalName}</title>
<meta name="description" content="${content.about.body.slice(0,120)}"/>
<meta name="keywords" content="${(content.keywords||[]).join(", ")}"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${theme.textColor};background:${theme.bg};line-height:1.75;word-break:keep-all}
a{color:inherit;text-decoration:none}
.wrap{max-width:1100px;margin:0 auto;padding:0 40px}
/* Header */
header{background:${theme.primary};position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.15)}
header .inner{display:flex;justify-content:space-between;align-items:center;max-width:1100px;margin:0 auto;padding:14px 40px}
.logo{color:#fff;font-weight:800;font-size:19px;letter-spacing:-.02em}
header nav a{color:rgba(255,255,255,.85);margin-left:28px;font-size:14px;transition:.2s}
header nav a:hover{color:#fff}
.header-tel{color:#fff;font-size:14px;opacity:.7;margin-left:24px}
/* Hero */
.hero{background:${grad};padding:100px 40px;color:#fff;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;right:-60px;top:-60px;width:320px;height:320px;
  background:rgba(255,255,255,.06);border-radius:50%}
.hero .label{font-size:11px;letter-spacing:.2em;opacity:.6;margin-bottom:14px;text-transform:uppercase}
.hero h1{font-size:2.6rem;font-weight:800;line-height:1.35;margin-bottom:16px;position:relative}
.hero p{font-size:1.1rem;opacity:.8;margin-bottom:36px;max-width:560px}
.btn{display:inline-flex;align-items:center;gap:8px;background:${theme.accent};color:#fff;
  padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;
  box-shadow:0 4px 16px ${theme.accent}55;transition:.2s}
.btn:hover{transform:translateY(-2px)}
.hero-tel{position:absolute;top:24px;right:40px;color:rgba(255,255,255,.7);font-size:14px}
/* Sections */
.section{padding:72px 0}
.section-label{font-size:11px;font-weight:700;letter-spacing:.15em;color:${theme.primary};text-transform:uppercase;margin-bottom:12px}
.section h2{font-size:1.75rem;font-weight:800;color:#1a1a1a;margin-bottom:10px}
.section .lead{font-size:15px;color:#666;max-width:640px;line-height:1.8;margin-bottom:32px}
.bg-gray{background:#faf8f5}
/* Services */
.services-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.service-card{background:#fff;border:1px solid #e8e5df;border-radius:14px;padding:22px 20px;
  transition:.2s;position:relative;overflow:hidden}
.service-card::before{content:'';position:absolute;top:0;left:0;width:4px;height:100%;background:${theme.primary}}
.service-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.08)}
.service-card h3{font-size:15px;font-weight:700;color:${theme.primary};margin-bottom:8px;padding-left:4px}
.service-card p{font-size:13px;color:#777;padding-left:4px}
/* Doctors */
.doctors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:20px}
.doc-card{background:#fff;border-radius:16px;padding:28px 20px;text-align:center;
  border:1px solid #e8e5df;transition:.2s}
.doc-card:hover{box-shadow:0 8px 24px rgba(0,0,0,.08)}
.doc-avatar{width:72px;height:72px;border-radius:50%;
  background:linear-gradient(135deg,${theme.primary},${theme.accent});
  margin:0 auto 14px;display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:28px}
.doc-name{font-weight:700;font-size:17px;margin-bottom:4px}
.doc-title{font-size:12px;color:${theme.primary};margin-bottom:8px;font-weight:600}
.doc-bio{font-size:12px;color:#777;line-height:1.6}
/* Notice */
.notice{background:linear-gradient(135deg,${theme.primary}0d,${theme.accent}0d);
  border-left:4px solid ${theme.accent};padding:20px 24px;border-radius:0 12px 12px 0;
  margin-top:20px}
.notice-title{font-weight:700;font-size:15px;margin-bottom:6px}
.notice-body{font-size:13px;color:#555}
/* Location */
.location-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.location-item{margin-bottom:20px}
.location-item label{font-size:11px;font-weight:700;color:#999;display:block;
  margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em}
.location-item p{font-size:14px;color:#444;line-height:1.7}
/* Footer */
footer{background:${theme.primary};color:#fff;padding:44px 0}
.footer-inner{display:grid;grid-template-columns:1fr auto;gap:32px;align-items:start;
  max-width:1100px;margin:0 auto;padding:0 40px}
.footer-logo{font-weight:800;font-size:19px;margin-bottom:8px}
.footer-tagline{opacity:.6;font-size:13px;margin-bottom:16px}
.footer-copy{opacity:.35;font-size:12px}
.footer-info{text-align:right;opacity:.55;font-size:13px;line-height:1.8}
/* Mobile */
@media(max-width:768px){
  .hero{padding:64px 24px}.hero h1{font-size:1.8rem}
  header .inner{padding:14px 20px}.wrap{padding:0 20px}
  .section{padding:48px 0}.footer-inner{grid-template-columns:1fr}
  .location-grid{grid-template-columns:1fr}.services-grid,.doctors-grid{grid-template-columns:1fr}
  .hero-tel{display:none}
}
</style>
</head>
<body>
<header>
  <div class="inner">
    <a class="logo" href="#">${intake.hospitalName}</a>
    <nav>
      <a href="#about">소개</a>
      <a href="#services">진료항목</a>
      <a href="#doctors">의료진</a>
      <a href="#location">오시는길</a>
      ${intake.phone ? `<a class="header-tel" href="tel:${intake.phone}">📞 ${intake.phone}</a>` : ""}
    </nav>
  </div>
</header>

<section class="hero wb-bg" data-field="hero">
  ${intake.phone ? `<div class="hero-tel">📞 ${intake.phone}</div>` : ""}
  <div class="wrap">
    <div class="label">${intake.hospitalName}</div>
    <h1 class="wb-hero-headline">${content.hero.headline}</h1>
    <p class="wb-hero-subline">${content.hero.subline}</p>
    <a class="btn wb-hero-cta" href="tel:${intake.phone||""}">${content.hero.cta} →</a>
  </div>
</section>

<section class="section wb-bg" data-field="about" id="about">
  <div class="wrap">
    <div class="section-label">About</div>
    <h2 class="wb-about-title">${content.about.title}</h2>
    <p class="lead wb-about-body">${content.about.body}</p>
    ${content.notice ? `
    <div class="notice">
      <div class="notice-title wb-notice-title">📢 ${content.notice.title}</div>
      <div class="notice-body wb-notice-body">${content.notice.body}</div>
    </div>` : ""}
  </div>
</section>

<section class="section bg-gray wb-bg" data-field="services" id="services">
  <div class="wrap">
    <div class="section-label">Services</div>
    <h2>진료항목</h2>
    <div class="services-grid">
      ${content.services.map(s => `
      <div class="service-card">
        <h3 class="wb-svc-name">${s.name}</h3>
        <p class="wb-svc-desc">${s.desc}</p>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section wb-bg" data-field="doctors" id="doctors">
  <div class="wrap">
    <div class="section-label">Doctors</div>
    <h2>의료진</h2>
    <div class="doctors-grid">
      ${content.doctors.map(d => `
      <div class="doc-card">
        <div class="doc-avatar wb-svc-icon">👨‍⚕️</div>
        <div class="doc-name wb-doc-name">${d.name}</div>
        <div class="doc-title wb-doc-title">${d.title}</div>
        <div class="doc-bio wb-doc-bio">${d.bio}</div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="section bg-gray wb-bg" data-field="location" id="location">
  <div class="wrap">
    <div class="section-label">Location</div>
    <h2>오시는길</h2>
    <div class="location-grid">
      <div>
        <div class="location-item">
          <label>주소</label>
          <p class="wb-location-address">${content.location.address || intake.address || ""}</p>
        </div>
        <div class="location-item">
          <label>진료시간</label>
          <p class="wb-location-hours">${content.location.hours}</p>
        </div>
      </div>
      <div>
        <div class="location-item">
          <label>주차</label>
          <p class="wb-location-parking">${content.location.parking}</p>
        </div>
        ${intake.phone ? `<div class="location-item"><label>전화</label><p>${intake.phone}</p></div>` : ""}
      </div>
    </div>
  </div>
</section>

<footer class="wb-bg" data-field="footer">
  <div class="footer-inner">
    <div>
      <div class="footer-logo">${intake.hospitalName}</div>
      <div class="footer-tagline wb-footer-tagline">${content.footer.tagline}</div>
      <div class="footer-copy">${content.footer.copy}</div>
    </div>
    <div class="footer-info">
      ${intake.address ? `<div>${intake.address}</div>` : ""}
      ${intake.phone ? `<div>${intake.phone}</div>` : ""}
    </div>
  </div>
</footer>
${editMode ? getInjectScript() : ""}
</body>
</html>`;
  }
};
