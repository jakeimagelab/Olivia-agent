import type { SiteTemplate, TemplateRenderData } from "./types";
import { getInjectScript } from "./inject";

// ─── Template 3: 따뜻한 ────────────────────────────────────────────────────────
// 라운드 모서리, 부드러운 색감, 친근한 느낌의 케어 중심 레이아웃.
// 소아과·산부인과·가정의학과·피부과 등 친근함이 중요한 병원에 적합.

export const warmTemplate: SiteTemplate = {
  id: "warm",
  name: "따뜻한",
  desc: "라운드 카드와 부드러운 색감의 친근한 케어 레이아웃",
  tag: "친근",
  tagColor: "#c06040",
  previewBg: "#fff8f3",
  previewLines: ["#e07050", "#fbbf24", "#f5ede8"],

  render: (data: TemplateRenderData) => {
    const { intake, content, theme, editMode } = data;
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
body{font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;
  color:${theme.textColor};background:${theme.bg};line-height:1.8;word-break:keep-all}
a{color:inherit;text-decoration:none}
.wrap{max-width:1060px;margin:0 auto;padding:0 36px}

/* Header */
header{background:#fff;padding:0;box-shadow:0 2px 20px rgba(0,0,0,.06);
  position:sticky;top:0;z-index:100}
.header-inner{display:flex;justify-content:space-between;align-items:center;
  max-width:1060px;margin:0 auto;padding:16px 36px}
.logo{display:flex;align-items:center;gap:10px}
.logo-icon{width:38px;height:38px;background:${theme.primary};border-radius:12px;
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px}
.logo-text{font-weight:800;font-size:17px;color:${theme.primary}}
.logo-sub{font-size:11px;color:#aaa;font-weight:500;margin-top:-2px}
header nav{display:flex;gap:24px;align-items:center}
header nav a{font-size:13px;color:#666;font-weight:500;padding:6px 0;
  border-bottom:2px solid transparent;transition:.2s}
header nav a:hover{color:${theme.primary};border-color:${theme.primary}}
.nav-cta{background:${theme.primary};color:#fff!important;padding:9px 20px!important;
  border-radius:24px;border:none!important;font-weight:700!important}

/* Hero — 스플릿 레이아웃 */
.hero{background:linear-gradient(135deg,${theme.bg} 0%,${theme.primary}0d 100%);
  padding:80px 36px;overflow:hidden;position:relative}
.hero-inner{max-width:1060px;margin:0 auto;display:grid;
  grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.hero-badge{display:inline-flex;align-items:center;gap:6px;
  background:${theme.accent}22;color:${theme.accent};
  padding:7px 16px;border-radius:24px;font-size:12px;font-weight:700;
  margin-bottom:20px;letter-spacing:.04em}
.hero h1{font-size:2.4rem;font-weight:800;line-height:1.35;
  color:${theme.primary};margin-bottom:16px;letter-spacing:-.02em}
.hero p{font-size:15px;color:#666;margin-bottom:32px;line-height:1.85}
.hero-actions{display:flex;gap:12px;flex-wrap:wrap}
.btn-round{background:${theme.primary};color:#fff;padding:14px 28px;
  border-radius:32px;font-weight:700;font-size:14px;
  box-shadow:0 6px 20px ${theme.primary}33;transition:.2s}
.btn-round:hover{transform:translateY(-2px)}
.btn-ghost{background:#fff;color:${theme.primary};border:2px solid ${theme.primary}40;
  padding:14px 28px;border-radius:32px;font-weight:600;font-size:14px;transition:.2s}
.hero-visual{display:flex;flex-direction:column;gap:12px}
.hero-card{background:#fff;border-radius:20px;padding:20px;
  box-shadow:0 4px 20px rgba(0,0,0,.08);display:flex;gap:14px;align-items:center}
.hero-card-icon{width:48px;height:48px;border-radius:14px;
  background:${theme.accent}18;display:flex;align-items:center;
  justify-content:center;font-size:22px;flex-shrink:0}
.hero-card-text h4{font-size:14px;font-weight:700;margin-bottom:3px;color:#333}
.hero-card-text p{font-size:12px;color:#888}

/* Features */
.features{padding:64px 0;background:#fff}
.features-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.feature-item{text-align:center;padding:32px 20px}
.feature-icon{font-size:40px;margin-bottom:16px;display:block}
.feature-item h3{font-size:16px;font-weight:700;color:${theme.primary};margin-bottom:8px}
.feature-item p{font-size:13px;color:#777;line-height:1.7}

/* About */
.about{padding:80px 0;
  background:linear-gradient(135deg,${theme.primary}08 0%,${theme.accent}08 100%)}
.about-inner{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.about-tag{display:inline-block;background:${theme.primary};color:#fff;
  font-size:11px;font-weight:700;padding:5px 14px;border-radius:6px;
  margin-bottom:16px;letter-spacing:.08em;text-transform:uppercase}
.about h2{font-size:1.85rem;font-weight:800;color:#1a1a1a;margin-bottom:16px;line-height:1.4}
.about p{font-size:14px;color:#555;line-height:1.9;margin-bottom:20px}
.about-stats{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:24px}
.about-stat{background:#fff;border-radius:14px;padding:16px 20px;text-align:center;
  box-shadow:0 2px 12px rgba(0,0,0,.05)}
.about-stat-num{font-size:1.6rem;font-weight:900;color:${theme.primary}}
.about-stat-label{font-size:12px;color:#888;margin-top:4px}
.about-visual{background:#fff;border-radius:24px;padding:32px;
  box-shadow:0 8px 32px rgba(0,0,0,.08)}
.notice-box{background:${theme.primary}0d;border:1.5px solid ${theme.primary}25;
  border-radius:14px;padding:18px 20px;margin-top:20px}
.notice-box h4{font-size:14px;font-weight:700;color:${theme.primary};margin-bottom:6px}
.notice-box p{font-size:13px;color:#666}

/* Services */
.services{padding:80px 0;background:#fff}
.section-head{text-align:center;margin-bottom:48px}
.section-tag{display:inline-block;font-size:11px;font-weight:700;
  letter-spacing:.12em;color:${theme.accent};text-transform:uppercase;margin-bottom:12px}
.section-head h2{font-size:1.85rem;font-weight:800;color:#1a1a1a}
.services-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.service-card{background:${theme.bg};border-radius:20px;padding:24px 20px;text-align:center;
  transition:.25s;border:1.5px solid transparent}
.service-card:hover{border-color:${theme.primary}30;background:#fff;
  box-shadow:0 8px 28px rgba(0,0,0,.08);transform:translateY(-4px)}
.service-emoji{font-size:32px;margin-bottom:12px;display:block}
.service-card h3{font-size:15px;font-weight:700;color:${theme.primary};margin-bottom:8px}
.service-card p{font-size:12px;color:#888;line-height:1.65}

/* Doctors */
.doctors{padding:80px 0;background:${theme.primary}06}
.doctors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}
.doc-card{background:#fff;border-radius:24px;overflow:hidden;transition:.2s;
  box-shadow:0 2px 16px rgba(0,0,0,.06)}
.doc-card:hover{box-shadow:0 8px 28px rgba(0,0,0,.1);transform:translateY(-3px)}
.doc-top{height:120px;background:linear-gradient(135deg,${theme.primary}dd,${theme.accent}cc);
  display:flex;align-items:center;justify-content:center;font-size:48px}
.doc-body{padding:20px}
.doc-name{font-size:17px;font-weight:800;margin-bottom:4px;color:#222}
.doc-title{font-size:12px;color:${theme.accent};font-weight:700;
  margin-bottom:10px;background:${theme.accent}12;display:inline-block;
  padding:3px 10px;border-radius:12px}
.doc-bio{font-size:12px;color:#777;line-height:1.7}

/* Location */
.location{padding:80px 0;background:#fff}
.location-inner{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}
.loc-group{display:flex;flex-direction:column;gap:16px}
.loc-row{display:flex;gap:16px;align-items:flex-start;
  background:${theme.bg};border-radius:16px;padding:18px 20px}
.loc-icon{width:40px;height:40px;border-radius:12px;background:${theme.primary};
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-size:18px;flex-shrink:0}
.loc-info label{font-size:11px;font-weight:700;color:#999;
  display:block;margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em}
.loc-info p{font-size:14px;color:#444;line-height:1.7}
.loc-map{background:${theme.primary}0d;border-radius:24px;
  height:240px;display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:12px;color:${theme.primary}60;font-size:48px}
.loc-map span{font-size:13px;font-weight:600;color:${theme.primary}80}

/* Footer */
footer{background:${theme.primary};padding:48px 0;color:#fff}
.footer-inner{max-width:1060px;margin:0 auto;padding:0 36px;
  display:grid;grid-template-columns:1fr auto;gap:32px;align-items:center}
.footer-logo{font-weight:800;font-size:20px;margin-bottom:6px}
.footer-tagline{color:rgba(255,255,255,.6);font-size:13px;margin-bottom:12px}
.footer-copy{color:rgba(255,255,255,.35);font-size:12px}
.footer-right{text-align:right;color:rgba(255,255,255,.5);font-size:13px;line-height:1.9}

/* Mobile */
@media(max-width:768px){
  .hero-inner,.about-inner,.location-inner,.footer-inner{grid-template-columns:1fr}
  .hero h1{font-size:1.75rem}
  .features-grid{grid-template-columns:1fr}
  .services-grid,.doctors-grid{grid-template-columns:1fr 1fr}
  .footer-right{text-align:left}
}
@media(max-width:480px){
  .services-grid,.doctors-grid{grid-template-columns:1fr}
  .about-stats{grid-template-columns:1fr 1fr}
}
</style>
</head>
<body>

<header>
  <div class="header-inner">
    <div class="logo">
      <div class="logo-icon">🏥</div>
      <div>
        <div class="logo-text">${intake.hospitalName}</div>
        <div class="logo-sub">${intake.specialties || "의원"}</div>
      </div>
    </div>
    <nav>
      <a href="#about">병원 소개</a>
      <a href="#services">진료항목</a>
      <a href="#doctors">의료진</a>
      <a href="#location">오시는길</a>
      ${intake.phone ? `<a class="nav-cta" href="tel:${intake.phone}">📞 상담 예약</a>` : ""}
    </nav>
  </div>
</header>

<section class="hero wb-bg" data-field="hero">
  <div class="hero-inner">
    <div>
      <div class="hero-badge">✨ ${intake.hospitalName}</div>
      <h1 class="wb-hero-headline">${content.hero.headline}</h1>
      <p class="wb-hero-subline">${content.hero.subline}</p>
      <div class="hero-actions">
        <a class="btn-round wb-hero-cta" href="tel:${intake.phone||""}">${content.hero.cta}</a>
        <a class="btn-ghost" href="#services">진료항목 보기</a>
      </div>
    </div>
    <div class="hero-visual">
      <div class="hero-card">
        <div class="hero-card-icon">📅</div>
        <div class="hero-card-text">
          <h4>간편 예약</h4>
          <p>전화 한 통으로 빠른 예약</p>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-icon">👨‍⚕️</div>
        <div class="hero-card-text">
          <h4>전문 의료진</h4>
          <p>풍부한 경험의 전문의</p>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-icon">💊</div>
        <div class="hero-card-text">
          <h4>체계적 치료</h4>
          <p>환자 맞춤형 진료 시스템</p>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="features wb-bg" data-field="features">
  <div class="wrap">
    <div class="features-grid">
      <div class="feature-item">
        <span class="feature-icon wb-svc-icon">🤝</span>
        <h3>친절한 상담</h3>
        <p>처음 오시는 분도 편안하게 진료받으실 수 있도록 세심하게 안내드립니다.</p>
      </div>
      <div class="feature-item">
        <span class="feature-icon wb-svc-icon">🔬</span>
        <h3>정확한 진단</h3>
        <p>최신 의료 장비와 풍부한 임상 경험으로 정확한 진단을 제공합니다.</p>
      </div>
      <div class="feature-item">
        <span class="feature-icon wb-svc-icon">💝</span>
        <h3>환자 중심</h3>
        <p>환자분의 회복과 건강이 저희의 최우선 목표입니다.</p>
      </div>
    </div>
  </div>
</section>

<section class="about wb-bg" data-field="about" id="about">
  <div class="wrap">
    <div class="about-inner">
      <div>
        <div class="about-tag">About</div>
        <h2 class="wb-about-title">${content.about.title}</h2>
        <p class="wb-about-body">${content.about.body}</p>
        <div class="about-stats">
          <div class="about-stat">
            <div class="about-stat-num">${content.services.length}+</div>
            <div class="about-stat-label">전문 진료</div>
          </div>
          <div class="about-stat">
            <div class="about-stat-num">★ 5.0</div>
            <div class="about-stat-label">환자 만족도</div>
          </div>
        </div>
      </div>
      <div class="about-visual">
        ${content.doctors.map(d => `
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">
          <div style="width:52px;height:52px;border-radius:50%;
            background:linear-gradient(135deg,${theme.primary},${theme.accent});
            display:flex;align-items:center;justify-content:center;
            color:#fff;font-size:22px;flex-shrink:0">👨‍⚕️</div>
          <div>
            <div style="font-weight:700;font-size:15px;margin-bottom:2px">${d.name}</div>
            <div style="font-size:12px;color:${theme.accent};font-weight:600">${d.title}</div>
          </div>
        </div>`).join("")}
        ${content.notice ? `
        <div class="notice-box">
          <h4>📢 <span class="wb-notice-title">${content.notice.title}</span></h4>
          <p class="wb-notice-body">${content.notice.body}</p>
        </div>` : ""}
      </div>
    </div>
  </div>
</section>

<section class="services wb-bg" data-field="services" id="services">
  <div class="wrap">
    <div class="section-head">
      <div class="section-tag">Services</div>
      <h2>진료항목</h2>
    </div>
    <div class="services-grid">
      ${content.services.map((s, i) => {
        const emojis = ["💊","🩺","🔬","💉","🏥","❤️","🧬","👁️","🦷","🦴"];
        return `
      <div class="service-card">
        <span class="service-emoji wb-svc-icon">${emojis[i % emojis.length]}</span>
        <h3 class="wb-svc-name">${s.name}</h3>
        <p class="wb-svc-desc">${s.desc}</p>
      </div>`;
      }).join("")}
    </div>
  </div>
</section>

<section class="doctors wb-bg" data-field="doctors" id="doctors">
  <div class="wrap">
    <div class="section-head">
      <div class="section-tag">Our Doctors</div>
      <h2>의료진</h2>
    </div>
    <div class="doctors-grid">
      ${content.doctors.map(d => `
      <div class="doc-card">
        <div class="doc-top wb-svc-icon">👨‍⚕️</div>
        <div class="doc-body">
          <div class="doc-name wb-doc-name">${d.name}</div>
          <div class="doc-title wb-doc-title">${d.title}</div>
          <div class="doc-bio wb-doc-bio">${d.bio}</div>
        </div>
      </div>`).join("")}
    </div>
  </div>
</section>

<section class="location wb-bg" data-field="location" id="location">
  <div class="wrap">
    <div class="section-head">
      <div class="section-tag">Location</div>
      <h2>오시는길</h2>
    </div>
    <div class="location-inner">
      <div class="loc-group">
        <div class="loc-row">
          <div class="loc-icon">📍</div>
          <div class="loc-info">
            <label>주소</label>
            <p class="wb-location-address">${content.location.address || intake.address || ""}</p>
          </div>
        </div>
        <div class="loc-row">
          <div class="loc-icon">🕐</div>
          <div class="loc-info">
            <label>진료시간</label>
            <p class="wb-location-hours">${content.location.hours}</p>
          </div>
        </div>
        <div class="loc-row">
          <div class="loc-icon">🅿️</div>
          <div class="loc-info">
            <label>주차</label>
            <p class="wb-location-parking">${content.location.parking}</p>
          </div>
        </div>
        ${intake.phone ? `
        <div class="loc-row">
          <div class="loc-icon">📞</div>
          <div class="loc-info">
            <label>전화</label>
            <p>${intake.phone}</p>
          </div>
        </div>` : ""}
      </div>
      <div class="loc-map">
        🗺️
        <span>지도 영역</span>
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
    <div class="footer-right">
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
