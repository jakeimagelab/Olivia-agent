import type { SiteTemplate, TemplateRenderData } from "./types";
import { getInjectScript } from "./inject";

// ─── Template 4: 메디홈 스타일 ─────────────────────────────────────────────────
// medihomebridge.kr 스타일:
// - 흰 배경 + sticky 헤더 (로고 좌, 메뉴 우)
// - 강렬한 히어로 섹션 (풀와이드, 중앙 텍스트)
// - 좌우 번갈아 분할되는 서비스 섹션 (텍스트 + 비주얼)
// - 번호+아이콘 서비스 카드
// - 의료진 프로필
// - 오시는길 + 클린 푸터

export const medihomeTemplate: SiteTemplate = {
  id: "medihome",
  name: "메디홈",
  desc: "좌우 교차 분할 레이아웃의 전문 병원 홈페이지",
  tag: "스플릿",
  tagColor: "#0066CC",
  previewBg: "#EEF4FF",
  previewLines: ["#0066CC", "#003399", "#dde8ff"],

  render: (data: TemplateRenderData) => {
    const { intake, content, theme, editMode } = data;
    const services = content.services || [];
    const doctors  = content.doctors  || [];

    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${intake.hospitalName}</title>
<meta name="description" content="${content.about.body.slice(0,120)}"/>
<meta name="keywords" content="${(content.keywords||[]).join(", ")}"/>
<style>
/* ── Reset ── */
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif;
  color:#1a1a1a;background:#fff;line-height:1.75;word-break:keep-all;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}

/* ── Layout ── */
.container{max-width:1140px;margin:0 auto;padding:0 48px}
.section{padding:80px 0}
.section--gray{background:#f8f9fc}
.section--dark{background:#0a1628;color:#fff}
.section--accent{background:${theme.primary};color:#fff}

/* ── Header ── */
.header{background:#fff;border-bottom:1px solid #e8eaf0;
  position:sticky;top:0;z-index:200;box-shadow:0 1px 12px rgba(0,0,0,.06)}
.header__inner{display:flex;align-items:center;justify-content:space-between;
  max-width:1140px;margin:0 auto;padding:0 48px;height:68px}
.header__logo{display:flex;align-items:center;gap:10px}
.header__logo-mark{width:36px;height:36px;background:${theme.primary};border-radius:10px;
  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:16px}
.header__logo-text{font-weight:800;font-size:18px;color:#0a1628;letter-spacing:-.02em}
.header__logo-sub{font-size:11px;color:#888;font-weight:500}
.header__nav{display:flex;align-items:center;gap:0}
.header__nav a{font-size:14px;font-weight:600;color:#444;padding:8px 18px;
  border-radius:8px;transition:.15s;white-space:nowrap}
.header__nav a:hover{color:${theme.primary};background:${theme.primary}0f}
.header__cta{background:${theme.primary};color:#fff;padding:9px 22px;border-radius:24px;
  font-size:13px;font-weight:700;margin-left:12px;white-space:nowrap;
  box-shadow:0 2px 8px ${theme.primary}44;transition:.2s;display:flex;align-items:center;gap:6px}
.header__cta:hover{transform:translateY(-1px);box-shadow:0 4px 14px ${theme.primary}55}

/* ── Hero ── */
.hero{background:linear-gradient(135deg,#0a1628 0%,${theme.primary} 100%);
  padding:110px 48px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;right:-100px;top:-100px;
  width:500px;height:500px;border-radius:50%;
  background:rgba(255,255,255,.04)}
.hero::after{content:'';position:absolute;right:150px;bottom:-80px;
  width:300px;height:300px;border-radius:50%;
  background:${theme.accent}22}
.hero__inner{max-width:1140px;margin:0 auto;position:relative;z-index:1}
.hero__kicker{display:inline-flex;align-items:center;gap:8px;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);
  color:rgba(255,255,255,.9);font-size:12px;font-weight:700;
  padding:7px 16px;border-radius:24px;margin-bottom:24px;letter-spacing:.08em;text-transform:uppercase}
.hero__kicker::before{content:'●';color:${theme.accent};font-size:8px}
.hero__title{font-size:3rem;font-weight:900;color:#fff;line-height:1.25;
  margin-bottom:20px;letter-spacing:-.03em;max-width:680px}
.hero__title em{color:${theme.accent};font-style:normal}
.hero__desc{font-size:1.05rem;color:rgba(255,255,255,.7);max-width:560px;
  line-height:1.85;margin-bottom:40px}
.hero__actions{display:flex;gap:14px;flex-wrap:wrap}
.hero__btn-main{background:#fff;color:${theme.primary};padding:15px 34px;
  border-radius:10px;font-weight:800;font-size:15px;
  box-shadow:0 4px 20px rgba(0,0,0,.25);transition:.2s}
.hero__btn-main:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(0,0,0,.3)}
.hero__btn-sub{background:transparent;color:rgba(255,255,255,.85);
  border:1.5px solid rgba(255,255,255,.35);padding:15px 34px;
  border-radius:10px;font-weight:600;font-size:15px;transition:.2s}
.hero__btn-sub:hover{border-color:rgba(255,255,255,.7);color:#fff}
.hero__badges{display:flex;gap:12px;margin-top:44px;flex-wrap:wrap}
.hero__badge{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
  color:rgba(255,255,255,.75);padding:8px 16px;border-radius:24px;font-size:12px;font-weight:600}
.hero__phone{position:absolute;top:28px;right:48px;
  color:rgba(255,255,255,.6);font-size:13px;display:flex;align-items:center;gap:6px}

/* ── Section Header ── */
.sec-hd{margin-bottom:52px}
.sec-hd--center{text-align:center}
.sec-tag{display:inline-block;background:${theme.primary}15;color:${theme.primary};
  font-size:11px;font-weight:800;padding:5px 14px;border-radius:6px;
  margin-bottom:14px;letter-spacing:.1em;text-transform:uppercase}
.sec-tag--white{background:rgba(255,255,255,.15);color:rgba(255,255,255,.9)}
.sec-hd h2{font-size:2.1rem;font-weight:900;line-height:1.3;letter-spacing:-.02em}
.sec-hd h2 strong{color:${theme.primary}}
.sec-hd h2.white{color:#fff}
.sec-hd h2.white strong{color:${theme.accent}}
.sec-hd p{font-size:15px;color:#666;margin-top:12px;line-height:1.85;max-width:560px}
.sec-hd p.white{color:rgba(255,255,255,.7)}

/* ── Split Sections ── */
.split{display:grid;grid-template-columns:1fr 1fr;gap:0;align-items:stretch}
.split__text{padding:72px 60px;display:flex;flex-direction:column;justify-content:center}
.split__visual{position:relative;min-height:400px;overflow:hidden;background:#eef2f8}
.split__visual--accent{background:linear-gradient(135deg,${theme.primary}22,${theme.accent}22)}
.split__visual--dark{background:#0a1628}
.split__visual-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  flex-direction:column;padding:40px}
.split__num{font-size:6rem;font-weight:900;color:${theme.primary}14;line-height:1;
  position:absolute;top:24px;right:32px;letter-spacing:-.05em}
.split__tag{display:inline-block;font-size:11px;font-weight:800;color:${theme.primary};
  text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px}
.split__tag--white{color:${theme.accent}}
.split__title{font-size:1.7rem;font-weight:900;line-height:1.35;
  margin-bottom:14px;letter-spacing:-.02em}
.split__title--white{color:#fff}
.split__body{font-size:14px;color:#555;line-height:1.9;margin-bottom:28px}
.split__body--white{color:rgba(255,255,255,.7)}
.split__list{list-style:none;display:flex;flex-direction:column;gap:10px}
.split__list li{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#444}
.split__list li::before{content:'✓';color:${theme.primary};font-weight:900;
  font-size:13px;margin-top:2px;flex-shrink:0}
.split__list--white li{color:rgba(255,255,255,.8)}
.split__list--white li::before{color:${theme.accent}}

/* 비주얼 플레이스홀더 */
.viz-card{background:#fff;border-radius:16px;padding:24px;width:100%;max-width:320px;
  box-shadow:0 8px 32px rgba(0,0,0,.1)}
.viz-card__bar{height:8px;border-radius:4px;margin-bottom:10px}
.viz-card__stat{font-size:2.2rem;font-weight:900;color:${theme.primary};line-height:1}
.viz-card__label{font-size:12px;color:#888;margin-top:6px}
.viz-blocks{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:320px}
.viz-block{background:#fff;border-radius:12px;padding:16px;
  box-shadow:0 4px 16px rgba(0,0,0,.08);text-align:center}
.viz-block__icon{font-size:28px;margin-bottom:8px}
.viz-block__label{font-size:12px;font-weight:600;color:#555}
.viz-bars{display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px}
.viz-bar-row{display:flex;align-items:center;gap:10px}
.viz-bar-label{font-size:12px;color:rgba(255,255,255,.6);width:60px;flex-shrink:0}
.viz-bar-track{flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.15);overflow:hidden}
.viz-bar-fill{height:100%;border-radius:4px;background:${theme.accent}}

/* ── Stats Strip ── */
.stats{background:${theme.primary};padding:40px 0}
.stats__grid{display:grid;grid-template-columns:repeat(4,1fr);
  max-width:1140px;margin:0 auto;padding:0 48px;gap:0}
.stats__item{text-align:center;padding:16px;
  border-right:1px solid rgba(255,255,255,.15)}
.stats__item:last-child{border-right:none}
.stats__num{font-size:2.2rem;font-weight:900;color:#fff;line-height:1;margin-bottom:6px}
.stats__unit{font-size:1rem;font-weight:700;color:${theme.accent};margin-left:2px}
.stats__label{font-size:12px;color:rgba(255,255,255,.6);font-weight:500}

/* ── Services Grid ── */
.services__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.svc-card{background:#fff;border:1.5px solid #e8eaf0;border-radius:16px;
  padding:28px 24px;transition:.25s;position:relative;overflow:hidden}
.svc-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:${theme.primary};transform:scaleX(0);transform-origin:left;transition:.3s}
.svc-card:hover::before{transform:scaleX(1)}
.svc-card:hover{border-color:${theme.primary}40;
  box-shadow:0 8px 28px rgba(0,0,0,.08);transform:translateY(-3px)}
.svc-card__num{font-size:1.5rem;font-weight:900;color:${theme.primary}22;
  margin-bottom:14px;font-variant-numeric:tabular-nums}
.svc-card__icon{font-size:32px;margin-bottom:12px;display:block}
.svc-card__name{font-size:16px;font-weight:800;color:#0a1628;margin-bottom:8px}
.svc-card__desc{font-size:13px;color:#777;line-height:1.7}

/* ── Doctors ── */
.doctors__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}
.doc-card{background:#fff;border-radius:20px;overflow:hidden;
  border:1px solid #e8eaf0;transition:.2s}
.doc-card:hover{box-shadow:0 10px 32px rgba(0,0,0,.1);transform:translateY(-4px)}
.doc-card__photo{height:160px;
  background:linear-gradient(135deg,${theme.primary},${theme.accent});
  display:flex;align-items:center;justify-content:center;font-size:56px;
  position:relative}
.doc-card__badge{position:absolute;top:12px;right:12px;
  background:rgba(255,255,255,.9);border-radius:20px;
  padding:4px 10px;font-size:11px;font-weight:700;color:${theme.primary}}
.doc-card__body{padding:22px}
.doc-card__name{font-size:18px;font-weight:900;margin-bottom:4px;color:#0a1628}
.doc-card__title{font-size:12px;color:${theme.primary};font-weight:700;
  margin-bottom:12px}
.doc-card__bio{font-size:13px;color:#777;line-height:1.7}

/* ── Notice Band ── */
.notice-band{background:${theme.accent};padding:20px 48px;
  display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.notice-band__icon{font-size:20px;flex-shrink:0}
.notice-band__title{font-weight:800;font-size:15px;color:#fff;margin-right:8px}
.notice-band__body{font-size:14px;color:rgba(255,255,255,.85)}
.notice-band__inner{max-width:1140px;margin:0 auto;width:100%;
  display:flex;align-items:center;gap:16px;flex-wrap:wrap}

/* ── Location ── */
.location__grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:start}
.location__info{display:flex;flex-direction:column;gap:20px}
.location__row{display:flex;gap:16px;align-items:flex-start}
.location__icon{width:44px;height:44px;border-radius:12px;background:${theme.primary}15;
  display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.location__detail label{font-size:11px;font-weight:700;color:#999;
  text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:5px}
.location__detail p{font-size:14px;color:#333;line-height:1.75}
.location__map{background:#eef2f8;border-radius:20px;height:280px;
  display:flex;align-items:center;justify-content:center;
  flex-direction:column;gap:12px;border:2px solid #e0e6f0}
.location__map-icon{font-size:48px;opacity:.4}
.location__map-text{font-size:13px;font-weight:600;color:#aab;
  letter-spacing:.05em}

/* ── CTA Section ── */
.cta-section{background:linear-gradient(135deg,#0a1628,${theme.primary});
  padding:80px 48px;text-align:center;position:relative;overflow:hidden}
.cta-section::before{content:'';position:absolute;
  width:400px;height:400px;border-radius:50%;
  background:${theme.accent}15;top:-100px;right:-100px}
.cta-section h2{font-size:2.2rem;font-weight:900;color:#fff;margin-bottom:12px}
.cta-section p{font-size:15px;color:rgba(255,255,255,.7);margin-bottom:36px}
.cta-section__btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.cta-btn-main{background:#fff;color:${theme.primary};padding:16px 40px;
  border-radius:12px;font-weight:800;font-size:16px;
  box-shadow:0 4px 20px rgba(0,0,0,.3);transition:.2s}
.cta-btn-main:hover{transform:translateY(-2px)}
.cta-btn-sub{border:2px solid rgba(255,255,255,.4);color:#fff;padding:16px 40px;
  border-radius:12px;font-weight:600;font-size:16px;transition:.2s}
.cta-btn-sub:hover{border-color:rgba(255,255,255,.8)}

/* ── Footer ── */
.footer{background:#0a1628;padding:52px 0 32px}
.footer__inner{max-width:1140px;margin:0 auto;padding:0 48px}
.footer__top{display:grid;grid-template-columns:1fr 1fr 1fr;gap:48px;
  padding-bottom:36px;border-bottom:1px solid rgba(255,255,255,.08)}
.footer__brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.footer__brand-mark{width:34px;height:34px;background:${theme.primary};border-radius:8px;
  display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px}
.footer__brand-name{font-weight:800;font-size:17px;color:#fff}
.footer__tagline{color:${theme.accent};font-size:13px;font-weight:600;margin-bottom:14px}
.footer__copy{color:rgba(255,255,255,.3);font-size:12px}
.footer__col-title{font-size:12px;font-weight:700;color:rgba(255,255,255,.4);
  text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px}
.footer__col-info{font-size:13px;color:rgba(255,255,255,.5);line-height:2}
.footer__bottom{display:flex;justify-content:space-between;align-items:center;
  padding-top:24px;font-size:12px;color:rgba(255,255,255,.25);flex-wrap:wrap;gap:8px}
.footer__bottom a{color:rgba(255,255,255,.35);margin-left:16px}

/* ── Mobile ── */
@media(max-width:900px){
  .split{grid-template-columns:1fr}
  .split__visual{min-height:260px}
  .split__text{padding:48px 32px}
  .services__grid{grid-template-columns:1fr 1fr}
  .stats__grid{grid-template-columns:1fr 1fr}
  .location__grid{grid-template-columns:1fr}
  .footer__top{grid-template-columns:1fr;gap:28px}
  .header__nav a{padding:8px 10px;font-size:13px}
  .hero__title{font-size:2rem}
}
@media(max-width:600px){
  .container{padding:0 24px}
  .hero{padding:72px 24px}
  .hero__title{font-size:1.7rem}
  .sec-hd h2{font-size:1.6rem}
  .services__grid{grid-template-columns:1fr}
  .stats__grid{grid-template-columns:1fr 1fr}
  .split__num{font-size:4rem}
  .header__inner{padding:0 20px}
  .header__nav{display:none}
}
</style>
</head>
<body>

<!-- ══ HEADER ══ -->
<header class="header">
  <div class="header__inner">
    <a class="header__logo" href="#">
      <div class="header__logo-mark">M</div>
      <div>
        <div class="header__logo-text">${intake.hospitalName}</div>
        <div class="header__logo-sub">${intake.specialties || "의원"}</div>
      </div>
    </a>
    <nav class="header__nav">
      <a href="#about">병원 소개</a>
      <a href="#services">진료항목</a>
      <a href="#doctors">의료진</a>
      <a href="#location">오시는길</a>
    </nav>
    ${intake.phone
      ? `<a class="header__cta" href="tel:${intake.phone}">📞 ${intake.phone}</a>`
      : `<a class="header__cta" href="#location">📞 전화 상담</a>`}
  </div>
</header>

<!-- ══ HERO ══ -->
<section class="hero wb-bg" data-field="hero">
  ${intake.phone ? `<div class="hero__phone">📞 ${intake.phone}</div>` : ""}
  <div class="hero__inner">
    <div class="hero__kicker">${intake.specialties || "전문 의료"} · ${intake.hospitalName}</div>
    <h1 class="hero__title wb-hero-headline">${content.hero.headline}</h1>
    <p class="hero__desc wb-hero-subline">${content.hero.subline}</p>
    <div class="hero__actions">
      <a class="hero__btn-main wb-hero-cta" href="tel:${intake.phone || "#"}">${content.hero.cta}</a>
      <a class="hero__btn-sub" href="#services">진료항목 보기</a>
    </div>
    <div class="hero__badges">
      <div class="hero__badge">✔ 전문 의료진</div>
      <div class="hero__badge">✔ 편리한 예약</div>
      <div class="hero__badge">✔ 체계적 진료</div>
      ${intake.specialties ? `<div class="hero__badge">✔ ${intake.specialties}</div>` : ""}
    </div>
  </div>
</section>

<!-- ══ STATS STRIP ══ -->
<div class="stats">
  <div class="stats__grid">
    <div class="stats__item">
      <div class="stats__num">${services.length}<span class="stats__unit">+</span></div>
      <div class="stats__label">전문 진료항목</div>
    </div>
    <div class="stats__item">
      <div class="stats__num">${doctors.length}<span class="stats__unit">명</span></div>
      <div class="stats__label">전문 의료진</div>
    </div>
    <div class="stats__item">
      <div class="stats__num">100<span class="stats__unit">%</span></div>
      <div class="stats__label">환자 만족도</div>
    </div>
    <div class="stats__item">
      <div class="stats__num">★ 5.0</div>
      <div class="stats__label">신뢰도</div>
    </div>
  </div>
</div>

<!-- ══ SPLIT 1: ABOUT ══ -->
<section id="about" class="wb-bg" data-field="about">
  <div class="split">
    <div class="split__text">
      <div class="split__num">01</div>
      <div class="split__tag">병원 소개</div>
      <h2 class="split__title wb-about-title">${content.about.title}</h2>
      <p class="split__body wb-about-body">${content.about.body}</p>
      <ul class="split__list">
        <li>환자 중심의 따뜻한 진료</li>
        <li>최신 장비와 검증된 치료법</li>
        <li>풍부한 임상 경험의 전문의</li>
        <li>편리한 위치와 넉넉한 주차</li>
      </ul>
    </div>
    <div class="split__visual split__visual--accent">
      <div class="split__visual-inner">
        <div class="viz-card">
          <div class="viz-card__bar" style="background:${theme.primary};width:80%"></div>
          <div class="viz-card__bar" style="background:${theme.accent};width:55%"></div>
          <div class="viz-card__bar" style="background:${theme.primary}44;width:68%"></div>
          <div class="viz-card__stat">100%</div>
          <div class="viz-card__label">환자 만족도</div>
        </div>
        <div style="margin-top:16px;text-align:center;color:${theme.primary};font-weight:700;font-size:13px">
          ${intake.hospitalName}
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══ SERVICES ══ -->
<section id="services" class="section section--gray wb-bg" data-field="services">
  <div class="container">
    <div class="sec-hd sec-hd--center">
      <div class="sec-tag">진료항목</div>
      <h2>전문 진료 서비스</h2>
      <p>체계적인 진단과 치료로 건강을 지켜드립니다</p>
    </div>
    <div class="services__grid">
      ${services.map((s, i) => {
        const icons = ["💊","🩺","🔬","💉","🏥","❤️‍🩹","🧬","👁️","🦷","🦴","🧠","🫁"];
        return `
      <div class="svc-card">
        <div class="svc-card__num">${String(i+1).padStart(2,"0")}</div>
        <span class="svc-card__icon wb-svc-icon">${icons[i % icons.length]}</span>
        <div class="svc-card__name wb-svc-name">${s.name}</div>
        <div class="svc-card__desc wb-svc-desc">${s.desc}</div>
      </div>`;
      }).join("")}
    </div>
  </div>
</section>

<!-- ══ DOCTORS ══ -->
<section class="section section--dark wb-bg" data-field="doctors" id="doctors">
  <div class="split" style="max-width:1140px;margin:0 auto">
    <div class="split__text">
      <div class="split__num" style="color:rgba(255,255,255,.06)">02</div>
      <div class="split__tag split__tag--white">의료진</div>
      <h2 class="split__title split__title--white">신뢰할 수 있는<br/>전문 의료진</h2>
      <p class="split__body split__body--white">
        풍부한 임상 경험과 지속적인 학술 활동으로 최신 의료 지식을 갖춘 전문의가 진료합니다.
      </p>
      <ul class="split__list split__list--white">
        ${doctors.map(d => `<li><span class="wb-doc-name">${d.name}</span> — <span class="wb-doc-title">${d.title}</span></li>`).join("")}
      </ul>
    </div>
    <div class="split__visual split__visual--dark">
      <div class="split__visual-inner">
        <div class="doctors__grid" style="grid-template-columns:1fr 1fr;gap:14px;max-width:320px">
          ${doctors.slice(0,4).map(d => `
          <div class="doc-card" style="background:#1a2a42;border-color:#2a3a55">
            <div class="doc-card__photo wb-svc-icon" style="height:90px;font-size:36px">👨‍⚕️
              <div class="doc-card__badge">${d.title.split(" ")[0]}</div>
            </div>
            <div class="doc-card__body" style="padding:14px">
              <div class="doc-card__name" style="color:#fff;font-size:15px">${d.name}</div>
              <div class="doc-card__bio wb-doc-bio" style="color:rgba(255,255,255,.5);font-size:12px;margin-top:4px">${d.bio}</div>
            </div>
          </div>`).join("")}
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ══ NOTICE ══ -->
${content.notice ? `
<section class="wb-bg" data-field="notice">
  <div class="split">
    <div class="split__visual" style="background:${theme.primary}10">
      <div class="split__visual-inner">
        <div class="viz-blocks">
          <div class="viz-block">
            <div class="viz-block__icon wb-svc-icon">📢</div>
            <div class="viz-block__label">공지사항</div>
          </div>
          <div class="viz-block">
            <div class="viz-block__icon wb-svc-icon">🎁</div>
            <div class="viz-block__label">이벤트</div>
          </div>
          <div class="viz-block">
            <div class="viz-block__icon wb-svc-icon">📅</div>
            <div class="viz-block__label">예약</div>
          </div>
          <div class="viz-block">
            <div class="viz-block__icon wb-svc-icon">💬</div>
            <div class="viz-block__label">상담</div>
          </div>
        </div>
      </div>
    </div>
    <div class="split__text">
      <div class="split__num">03</div>
      <div class="split__tag">공지·이벤트</div>
      <h2 class="split__title wb-notice-title">${content.notice.title}</h2>
      <p class="split__body wb-notice-body">${content.notice.body}</p>
      <a href="tel:${intake.phone||""}"
        style="display:inline-flex;align-items:center;gap:8px;margin-top:8px;
          background:${theme.primary};color:#fff;padding:12px 24px;border-radius:8px;
          font-weight:700;font-size:14px">
        📞 전화 문의하기
      </a>
    </div>
  </div>
</section>` : ""}

<!-- ══ LOCATION ══ -->
<section class="section section--gray wb-bg" data-field="location" id="location">
  <div class="container">
    <div class="sec-hd">
      <div class="sec-tag">오시는길</div>
      <h2>찾아오시는 방법</h2>
    </div>
    <div class="location__grid">
      <div class="location__info">
        <div class="location__row">
          <div class="location__icon">📍</div>
          <div class="location__detail">
            <label>주소</label>
            <p class="wb-location-address">${content.location.address || intake.address || "주소를 입력해주세요"}</p>
          </div>
        </div>
        <div class="location__row">
          <div class="location__icon">🕐</div>
          <div class="location__detail">
            <label>진료시간</label>
            <p class="wb-location-hours">${content.location.hours}</p>
          </div>
        </div>
        <div class="location__row">
          <div class="location__icon">🅿️</div>
          <div class="location__detail">
            <label>주차</label>
            <p class="wb-location-parking">${content.location.parking}</p>
          </div>
        </div>
        ${intake.phone ? `
        <div class="location__row">
          <div class="location__icon">📞</div>
          <div class="location__detail">
            <label>전화</label>
            <p><a href="tel:${intake.phone}" style="color:${theme.primary};font-weight:700">${intake.phone}</a></p>
          </div>
        </div>` : ""}
      </div>
      <div class="location__map">
        <div class="location__map-icon">🗺️</div>
        <div class="location__map-text">지도 영역 (Google/Naver Map 삽입)</div>
      </div>
    </div>
  </div>
</section>

<!-- ══ CTA ══ -->
<section class="cta-section wb-bg" data-field="cta">
  <div style="position:relative;z-index:1">
    <h2 class="wb-hero-headline">${content.hero.headline}</h2>
    <p>지금 바로 전화 또는 온라인으로 편리하게 예약하세요</p>
    <div class="cta-section__btns">
      <a class="cta-btn-main wb-hero-cta" href="tel:${intake.phone||""}">${content.hero.cta}</a>
      <a class="cta-btn-sub" href="#about">병원 소개 보기</a>
    </div>
  </div>
</section>

<!-- ══ FOOTER ══ -->
<footer class="footer wb-bg" data-field="footer">
  <div class="footer__inner">
    <div class="footer__top">
      <div>
        <div class="footer__brand">
          <div class="footer__brand-mark">M</div>
          <div class="footer__brand-name">${intake.hospitalName}</div>
        </div>
        <div class="footer__tagline wb-footer-tagline">${content.footer.tagline}</div>
        <div class="footer__copy">${content.footer.copy}</div>
      </div>
      <div>
        <div class="footer__col-title">진료 안내</div>
        <div class="footer__col-info">
          ${services.slice(0,4).map(s=>`<div>${s.name}</div>`).join("")}
        </div>
      </div>
      <div>
        <div class="footer__col-title">병원 정보</div>
        <div class="footer__col-info">
          ${intake.address ? `<div>${intake.address}</div>` : ""}
          ${intake.phone ? `<div>Tel. ${intake.phone}</div>` : ""}
          ${intake.specialties ? `<div>${intake.specialties}</div>` : ""}
        </div>
      </div>
    </div>
    <div class="footer__bottom">
      <span>${content.footer.copy}</span>
      <span>
        <a href="#">개인정보처리방침</a>
        <a href="#">이용약관</a>
      </span>
    </div>
  </div>
</footer>
${editMode ? getInjectScript() : ""}
</body>
</html>`;
  }
};
