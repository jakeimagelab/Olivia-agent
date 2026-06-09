import type { SiteTemplate, TemplateRenderData } from "./types";

// ─── Template 2: 프리미엄 ────────────────────────────────────────────────────
// 고급스러운 센터 정렬 레이아웃. 대형 타이포, 번호형 서비스, 임팩트 있는 히어로.

export const premiumTemplate: SiteTemplate = {
  id: "premium",
  name: "프리미엄",
  desc: "대형 타이포그래피와 번호형 서비스 카드의 고급 레이아웃",
  tag: "고급",
  tagColor: "#b8860b",
  previewBg: "#1a1a2e",
  previewLines: ["#d4a843", "#ffffff", "#333366"],

  render: ({ intake, content, theme }: TemplateRenderData) => {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${intake.hospitalName}</title>
<meta name="description" content="${content.about.body.slice(0,120)}"/>
<meta name="keywords" content="${(content.keywords||[]).join(", ")}"/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:${theme.textColor};background:${theme.bg};line-height:1.75;word-break:keep-all}
a{color:inherit;text-decoration:none}
.wrap{max-width:1000px;margin:0 auto;padding:0 40px}
.center{text-align:center}

/* Header */
header{background:rgba(255,255,255,.95);backdrop-filter:blur(10px);
  border-bottom:1px solid rgba(0,0,0,.08);position:sticky;top:0;z-index:100}
.header-inner{display:flex;justify-content:space-between;align-items:center;
  max-width:1000px;margin:0 auto;padding:16px 40px}
.logo{font-weight:900;font-size:18px;color:${theme.primary};letter-spacing:-.02em}
.logo span{color:${theme.accent};font-size:12px;font-weight:600;display:block;
  letter-spacing:.1em;text-transform:uppercase;margin-top:-2px}
header nav{display:flex;gap:32px;align-items:center}
header nav a{font-size:13px;color:#555;font-weight:500;transition:.2s;letter-spacing:.02em}
header nav a:hover{color:${theme.primary}}
.tel-badge{background:${theme.primary};color:#fff;padding:8px 18px;border-radius:24px;
  font-size:13px;font-weight:700;letter-spacing:.02em}

/* Hero — 풀 다크 + 센터 */
.hero{background:${theme.primary};min-height:88vh;display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;padding:80px 40px;
  position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse 80% 60% at 50% 40%, ${theme.accent}22 0%, transparent 70%)}
.hero-kicker{font-size:11px;letter-spacing:.25em;color:${theme.accent};
  text-transform:uppercase;margin-bottom:24px;font-weight:600}
.hero h1{font-size:3.4rem;font-weight:900;color:#fff;line-height:1.25;
  margin-bottom:20px;letter-spacing:-.03em;max-width:700px}
.hero h1 em{color:${theme.accent};font-style:normal}
.hero p{font-size:1.1rem;color:rgba(255,255,255,.65);max-width:520px;
  margin:0 auto 40px;line-height:1.8}
.hero-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn-primary{background:${theme.accent};color:#fff;padding:15px 36px;border-radius:8px;
  font-weight:700;font-size:15px;letter-spacing:.02em;
  box-shadow:0 8px 24px ${theme.accent}44;transition:.2s}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 32px ${theme.accent}55}
.btn-outline{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.35);
  padding:15px 36px;border-radius:8px;font-weight:600;font-size:15px;transition:.2s}
.btn-outline:hover{border-color:rgba(255,255,255,.7)}
.hero-scroll{position:absolute;bottom:32px;left:50%;transform:translateX(-50%);
  color:rgba(255,255,255,.35);font-size:11px;letter-spacing:.1em;text-transform:uppercase}

/* Stats bar */
.stats-bar{background:#fff;padding:28px 0;border-bottom:1px solid #f0ede8}
.stats-inner{display:flex;justify-content:center;gap:64px;max-width:1000px;margin:0 auto;padding:0 40px}
.stat{text-align:center}
.stat-num{font-size:1.8rem;font-weight:900;color:${theme.primary};line-height:1}
.stat-label{font-size:12px;color:#888;margin-top:6px;letter-spacing:.05em}

/* About */
.about{padding:96px 0;text-align:center}
.tag-label{display:inline-block;background:${theme.accent}18;color:${theme.accent};
  font-size:11px;font-weight:700;letter-spacing:.12em;padding:6px 16px;
  border-radius:24px;text-transform:uppercase;margin-bottom:20px}
.about h2{font-size:2rem;font-weight:800;color:#1a1a1a;margin-bottom:16px;letter-spacing:-.02em}
.about p{font-size:15px;color:#666;max-width:600px;margin:0 auto;line-height:1.9}

/* Services — 번호형 */
.services{padding:80px 0;background:#faf8f5}
.services h2{font-size:2rem;font-weight:800;color:#1a1a1a;margin-bottom:48px;
  text-align:center;letter-spacing:-.02em}
.services-list{display:grid;grid-template-columns:1fr 1fr;gap:2px;
  background:${theme.primary}12;border-radius:16px;overflow:hidden}
.service-item{background:#fff;padding:32px 36px;display:flex;gap:20px;align-items:flex-start;transition:.2s}
.service-item:hover{background:${theme.primary}06}
.service-num{font-size:2rem;font-weight:900;color:${theme.accent}40;
  line-height:1;flex-shrink:0;width:48px;font-variant-numeric:tabular-nums}
.service-text h3{font-size:16px;font-weight:700;color:${theme.primary};margin-bottom:8px}
.service-text p{font-size:13px;color:#777;line-height:1.7}

/* Doctors */
.doctors{padding:96px 0}
.doctors h2{font-size:2rem;font-weight:800;color:#1a1a1a;margin-bottom:48px;
  text-align:center;letter-spacing:-.02em}
.doctors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px}
.doc-card{background:#fff;border-radius:20px;overflow:hidden;
  box-shadow:0 4px 24px rgba(0,0,0,.06);transition:.2s}
.doc-card:hover{transform:translateY(-4px);box-shadow:0 12px 36px rgba(0,0,0,.1)}
.doc-photo{height:140px;background:linear-gradient(135deg,${theme.primary},${theme.accent});
  display:flex;align-items:center;justify-content:center;font-size:48px}
.doc-info{padding:20px}
.doc-name{font-weight:800;font-size:17px;margin-bottom:4px}
.doc-title{font-size:12px;color:${theme.accent};font-weight:700;
  margin-bottom:10px;text-transform:uppercase;letter-spacing:.05em}
.doc-bio{font-size:12px;color:#888;line-height:1.7}

/* Notice */
.notice-section{padding:48px 0;background:${theme.primary}}
.notice-inner{max-width:1000px;margin:0 auto;padding:0 40px;
  display:flex;gap:24px;align-items:center}
.notice-badge{background:${theme.accent};color:#fff;padding:6px 14px;
  border-radius:24px;font-size:11px;font-weight:700;white-space:nowrap;letter-spacing:.05em}
.notice-text h3{font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}
.notice-text p{font-size:13px;color:rgba(255,255,255,.65)}

/* Location */
.location{padding:96px 0;background:#faf8f5}
.location h2{font-size:2rem;font-weight:800;color:#1a1a1a;margin-bottom:48px;
  text-align:center}
.location-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}
.loc-card{background:#fff;border-radius:16px;padding:28px 24px;
  box-shadow:0 2px 12px rgba(0,0,0,.05)}
.loc-icon{font-size:24px;margin-bottom:12px}
.loc-label{font-size:11px;font-weight:700;color:${theme.primary};
  text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.loc-value{font-size:14px;color:#444;line-height:1.7}

/* Footer */
footer{background:#0d0d0d;color:#fff;padding:56px 0}
.footer-inner{max-width:1000px;margin:0 auto;padding:0 40px;
  display:grid;grid-template-columns:1fr auto;gap:48px;align-items:start}
.footer-brand{font-weight:900;font-size:20px;letter-spacing:-.02em;margin-bottom:10px}
.footer-tagline{color:${theme.accent};font-size:13px;font-weight:600;margin-bottom:16px;letter-spacing:.05em}
.footer-copy{color:rgba(255,255,255,.3);font-size:12px}
.footer-right{text-align:right;color:rgba(255,255,255,.4);font-size:13px;line-height:1.9}

/* Mobile */
@media(max-width:768px){
  .hero h1{font-size:2.2rem}
  .stats-inner{gap:32px;flex-wrap:wrap}
  .services-list{grid-template-columns:1fr}
  .location-grid{grid-template-columns:1fr}
  .footer-inner{grid-template-columns:1fr}
  .footer-right{text-align:left}
  .header-inner{padding:14px 20px}
  .notice-inner{flex-direction:column;gap:12px}
}
</style>
</head>
<body>

<header>
  <div class="header-inner">
    <div class="logo">
      ${intake.hospitalName}
      <span>${intake.specialties || "의원"}</span>
    </div>
    <nav>
      <a href="#about">소개</a>
      <a href="#services">진료항목</a>
      <a href="#doctors">의료진</a>
      <a href="#location">오시는길</a>
      ${intake.phone ? `<a class="tel-badge" href="tel:${intake.phone}">${intake.phone}</a>` : ""}
    </nav>
  </div>
</header>

<section class="hero">
  <div class="hero-kicker">${intake.hospitalName} · ${intake.specialties || "의원"}</div>
  <h1>${content.hero.headline}</h1>
  <p>${content.hero.subline}</p>
  <div class="hero-btns">
    <a class="btn-primary" href="tel:${intake.phone||""}">${content.hero.cta}</a>
    <a class="btn-outline" href="#about">병원 소개 →</a>
  </div>
  <div class="hero-scroll">scroll</div>
</section>

<div class="stats-bar">
  <div class="stats-inner">
    <div class="stat"><div class="stat-num">24h</div><div class="stat-label">친절한 상담</div></div>
    <div class="stat"><div class="stat-num">${content.services.length}+</div><div class="stat-label">전문 진료</div></div>
    <div class="stat"><div class="stat-num">100%</div><div class="stat-label">환자 중심</div></div>
    <div class="stat"><div class="stat-num">★ 5.0</div><div class="stat-label">신뢰도</div></div>
  </div>
</div>

<section class="about" id="about">
  <div class="wrap">
    <div class="tag-label">About Us</div>
    <h2>${content.about.title}</h2>
    <p>${content.about.body}</p>
  </div>
</section>

<section class="services" id="services">
  <div class="wrap">
    <h2>진료항목</h2>
    <div class="services-list">
      ${content.services.map((s, i) => `
      <div class="service-item">
        <div class="service-num">${String(i+1).padStart(2,"0")}</div>
        <div class="service-text">
          <h3>${s.name}</h3>
          <p>${s.desc}</p>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="doctors" id="doctors">
  <div class="wrap">
    <h2>의료진</h2>
    <div class="doctors-grid">
      ${content.doctors.map(d => `
      <div class="doc-card">
        <div class="doc-photo">👨‍⚕️</div>
        <div class="doc-info">
          <div class="doc-name">${d.name}</div>
          <div class="doc-title">${d.title}</div>
          <div class="doc-bio">${d.bio}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

${content.notice ? `
<section class="notice-section">
  <div class="notice-inner">
    <div class="notice-badge">공지</div>
    <div class="notice-text">
      <h3>${content.notice.title}</h3>
      <p>${content.notice.body}</p>
    </div>
  </div>
</section>` : ""}

<section class="location" id="location">
  <div class="wrap">
    <h2>오시는길</h2>
    <div class="location-grid">
      <div class="loc-card">
        <div class="loc-icon">📍</div>
        <div class="loc-label">주소</div>
        <div class="loc-value">${content.location.address || intake.address || ""}</div>
      </div>
      <div class="loc-card">
        <div class="loc-icon">🕐</div>
        <div class="loc-label">진료시간</div>
        <div class="loc-value">${content.location.hours}</div>
      </div>
      <div class="loc-card">
        <div class="loc-icon">🅿️</div>
        <div class="loc-label">주차</div>
        <div class="loc-value">${content.location.parking}</div>
      </div>
    </div>
  </div>
</section>

<footer>
  <div class="footer-inner">
    <div>
      <div class="footer-brand">${intake.hospitalName}</div>
      <div class="footer-tagline">${content.footer.tagline}</div>
      <div class="footer-copy">${content.footer.copy}</div>
    </div>
    <div class="footer-right">
      ${intake.address ? `<div>${intake.address}</div>` : ""}
      ${intake.phone ? `<div>${intake.phone}</div>` : ""}
    </div>
  </div>
</footer>

</body>
</html>`;
  }
};
