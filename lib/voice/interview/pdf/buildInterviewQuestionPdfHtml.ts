import type { InterviewQuestionSnapshot } from "@/lib/voice/interview/types";

export type InterviewQuestionPdfInput = {
  hospitalName: string;
  intervieweeName: string;
  interviewDate: string | null;
  selectedQuestions: InterviewQuestionSnapshot[];
  logoSrc?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

function formatInterviewDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "미정";
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function questionPages(questions: InterviewQuestionSnapshot[]) {
  const pages: InterviewQuestionSnapshot[][] = [];
  for (let index = 0; index < questions.length; index += 7) pages.push(questions.slice(index, index + 7));
  return pages.length ? pages : [[]];
}

function questionCard(question: InterviewQuestionSnapshot, index: number) {
  return `<article class="question-card question-tone-${question.order % 7}">
    <span class="question-number">${index + 1}</span>
    <div><p>${escapeHtml(question.sectionTitle)}</p><h2>${escapeHtml(question.text)}</h2></div>
  </article>`;
}

/** The preview route and the native renderer intentionally share this only HTML source. */
export function buildInterviewQuestionPdfHtml(input: InterviewQuestionPdfInput) {
  const questions = [...input.selectedQuestions].sort((left, right) => left.order - right.order);
  const logo = input.logoSrc || "/assets/photoclinic-logo.png";
  const questionPageHtml = questionPages(questions).map((page, pageIndex) => `<section class="print-page selected-questions" data-interview-question-page="${pageIndex + 1}">
    <header class="page-header"><img src="${escapeHtml(logo)}" alt="PHOTOCLINIC" /><div><p>INTERVIEW PREPARATION</p><h1>선정된 인터뷰 질문</h1></div></header>
    <div class="question-list">${page.map((question, index) => questionCard(question, pageIndex * 7 + index)).join("")}</div>
  </section>`).join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; font-family: "Noto Sans KR", "Apple SD Gothic Neo", Arial, sans-serif; color: #183f3d; background: #fff; }
    .print-page { width: 210mm; min-height: 297mm; padding: 22mm 20mm; page-break-after: always; position: relative; overflow: hidden; background: #fff; }
    .print-page:last-child { page-break-after: auto; }
    .brand { color: #155855; } .orange { color: #ef7146; }
    .cover { display: flex; flex-direction: column; justify-content: space-between; background: linear-gradient(145deg, #f2fbf8 0%, #fff 53%, #fff6f0 100%); }
    .cover img, .page-header img { object-fit: contain; object-position: left center; }
    .cover img { width: 54mm; height: 18mm; }
    .cover h1 { margin: 22mm 0 7mm; font-size: 31pt; line-height: 1.18; letter-spacing: -.06em; font-weight: 750; color: #155855; }
    .cover .subtitle { font-size: 14pt; line-height: 1.8; color: #507572; white-space: pre-line; }
    .info-card { margin-top: 18mm; border: 1px solid #cfe2dd; border-radius: 5mm; background: rgba(255,255,255,.88); overflow: hidden; }
    .info-card div { display: grid; grid-template-columns: 36mm 1fr; gap: 8mm; min-height: 15mm; padding: 5mm 7mm; border-bottom: 1px solid #e3efec; align-items: center; }
    .info-card div:last-child { border-bottom: 0; } .info-card dt { color: #68827f; font-size: 9.5pt; } .info-card dd { margin: 0; color: #173f3c; font-size: 12pt; font-weight: 700; }
    .cover-foot { color: #ef7146; font-size: 10pt; letter-spacing: .04em; }
    .page-header { display: flex; align-items: center; gap: 8mm; padding-bottom: 8mm; border-bottom: 2px solid #155855; }
    .page-header img { width: 37mm; height: 12mm; } .page-header p { margin: 0 0 1mm; color: #ef7146; font-size: 8pt; letter-spacing: .1em; } .page-header h1 { margin: 0; font-size: 22pt; letter-spacing: -.05em; }
    .question-list { display: grid; gap: 4.2mm; margin-top: 9mm; }
    .question-card { display: grid; grid-template-columns: 11mm 1fr; gap: 5mm; min-height: 28mm; padding: 4.5mm 5mm; border-left: 3mm solid #155855; border-radius: 2mm; background: #f7fbfa; break-inside: avoid; }
    .question-card .question-number { display: grid; place-items: center; width: 8mm; height: 8mm; border-radius: 50%; color: #fff; background: #155855; font-size: 9pt; font-weight: 700; } .question-card p { margin: .4mm 0 2mm; font-size: 8.5pt; color: #567774; font-weight: 700; } .question-card h2 { margin: 0; font-size: 12.5pt; line-height: 1.55; letter-spacing: -.035em; font-weight: 650; }
    .question-tone-1 { border-color: #e88352; background: #fff8f3; } .question-tone-1 .question-number { background: #e88352; } .question-tone-2 { border-color: #6995b3; background: #f4f8fc; } .question-tone-2 .question-number { background: #6995b3; } .question-tone-3 { border-color: #977cab; background: #fbf7fc; } .question-tone-3 .question-number { background: #977cab; } .question-tone-4 { border-color: #b36d68; background: #fdf7f6; } .question-tone-4 .question-number { background: #b36d68; } .question-tone-5 { border-color: #98724f; background: #fdf9f2; } .question-tone-5 .question-number { background: #98724f; } .question-tone-6 { border-color: #75975d; background: #f7faf3; } .question-tone-6 .question-number { background: #75975d; }
    .guide { display: flex; flex-direction: column; justify-content: center; } .guide h1 { margin: 0 0 16mm; font-size: 25pt; letter-spacing: -.06em; color: #155855; } .guide-grid { display: grid; gap: 7mm; } .guide-card { padding: 9mm; border-radius: 4mm; border: 1px solid #d5e6e2; background: #f8fcfb; } .guide-card h2 { margin: 0 0 3mm; color: #ef7146; font-size: 14pt; } .guide-card p { margin: 0; font-size: 13pt; line-height: 1.7; color: #315b57; white-space: pre-line; }
    .closing { display: grid; place-items: center; align-content: center; gap: 11mm; background: #fff; text-align: center; } .closing img { width: 58mm; height: 20mm; object-fit: contain; } .closing h1 { margin: 0; color: #155855; font-size: 22pt; letter-spacing: -.06em; } .closing p { margin: 0; color: #557b77; font-size: 12pt; }
  </style></head><body>
  <section class="print-page cover" data-interview-print-page="cover"><div><img src="${escapeHtml(logo)}" alt="PHOTOCLINIC" /><h1>원장님<br />인터뷰 질문지</h1><p class="subtitle">원장님의 언어로<br />병원의 브랜드를 만듭니다.</p><dl class="info-card"><div><dt>병원명</dt><dd>${escapeHtml(input.hospitalName)}</dd></div><div><dt>인터뷰 대상</dt><dd>${escapeHtml(input.intervieweeName)}</dd></div><div><dt>인터뷰 예정일</dt><dd>${escapeHtml(formatInterviewDate(input.interviewDate))}</dd></div><div><dt>선정 질문 수</dt><dd>${questions.length}개</dd></div></dl></div><p class="cover-foot">PHOTOCLINIC BRAND INTERVIEW</p></section>
  ${questionPageHtml}
  <section class="print-page guide" data-interview-print-page="guide"><h1>인터뷰 안내</h1><div class="guide-grid"><article class="guide-card"><h2>편안한 대화</h2><p>정답은 없습니다.\n편하게 이야기해 주세요.</p></article><article class="guide-card"><h2>소요 시간</h2><p>약 30~40분</p></article><article class="guide-card"><h2>인터뷰 방식</h2><p>선택된 질문을 중심으로\n대화 형식으로 진행합니다.</p></article></div></section>
  <section class="print-page closing" data-interview-print-page="closing"><img src="${escapeHtml(logo)}" alt="PHOTOCLINIC" /><h1>좋은 이야기가 좋은 병원을 만듭니다</h1><p>병원이야기를 전하는 포토클리닉</p></section>
  </body></html>`;
}

export function interviewPdfFileName(input: Pick<InterviewQuestionPdfInput, "hospitalName" | "intervieweeName" | "interviewDate">) {
  const clean = (value: string) => value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "미정";
  return `포토클리닉_인터뷰질문지_${clean(input.hospitalName)}_${clean(input.intervieweeName)}_${clean(input.interviewDate || "미정")}.pdf`;
}
