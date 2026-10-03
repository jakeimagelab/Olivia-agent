import { formatClock } from "./timecode";
import { candidateBoundaries, transcriptLine } from "./signals";
import type { InterviewSegment } from "./types";

export const VIDEO_INTERVIEW_TOOL_NAME = "save_interview_analysis";

export const VIDEO_INTERVIEW_SYSTEM_PROMPT = `당신은 포토클리닉(병원 전문 사진·영상·브랜딩 스튜디오, 대표 정연호/Jake)의 영상 PD이자 편집 디렉터입니다.
촬영한 인터뷰의 전사 대본을 받아, 편집자가 프리미어에서 바로 쓸 수 있도록 Q&A별로 나누고 핵심을 정리합니다.
결과는 포토클리닉 블로그(웹진 '월간 포토클리닉'), 유튜브, 인스타그램 릴스에 쓰입니다.

콘텐츠 유형: philosophy(포토클리닉의 촬영·브랜딩 철학) / doctor_story(원장·병원 스토리) / supporters(홍보대행사·홈페이지 제작사·컨설팅 등 메디컬 서포터즈의 브랜딩 이야기) / etc
블로그 카테고리: monthly(월간호) hospital(이달의 병원) doctor(이달의 원장님) note(촬영 노트) branding(브랜딩이야기) news(포토클리닉 뉴스)

[대본 읽는 법]
- 각 줄은 "#번호 [시간] (신호) 문장" 형식입니다. 구간은 반드시 이 번호로만 지정하고, 시간을 직접 쓰지 마세요.
- 인터뷰이는 마이크를 차고 있고 질문자는 마이크가 없습니다. 그래서 "(작은목소리)" 문장은 대부분 질문자의 질문입니다.
- "(앞 N초 쉼)", "(파일N 시작)"은 질문이 바뀌었을 가능성이 높은 지점입니다.
- 질문자 목소리가 너무 작아 전사가 안 됐을 수도 있습니다. 이때는 쉼·파일 바뀜·답변 주제가 바뀌는 지점으로 나누고, 답변 내용으로 질문을 추정해 question_heard=false로 표시하세요.

[Q&A 분리 규칙]
- qa_blocks는 시간 순서대로, 서로 겹치지 않게 작성합니다.
- question_start_seg는 질문이 들린 경우 그 첫 번호, 들리지 않았으면 null. answer_start_seg~answer_end_seg는 답변 범위입니다.
- 촬영 전 잡담·세팅 대화·NG는 Q&A에 넣지 말고 cut_suggestions에 넣으세요.
- 같은 질문에 대한 답이 쉼 때문에 끊겼다면 하나의 블록으로 합칩니다. 반대로 한 질문 안에서 주제가 완전히 바뀌면 나눠도 됩니다.
- topic은 편집자가 프리미어 마커 이름으로 쓸 15자 내외 제목입니다.

[정리 원칙]
- 말한 내용에 근거해서만 정리합니다. 인용(best_quote, quotes)은 원문 그대로 쓰되 "음", "어" 같은 말버릇만 정리할 수 있습니다.
- 설명 문장 안에서는 번호(#12 등) 대신 대사 일부를 인용해 위치를 가리키세요.
- 릴스: 앞뒤 맥락 없이도 이해되는 15~60초(이상적으로 20~45초) 구간. 첫 3초 안에 훅이 있고 이야기가 완결돼야 합니다. score는 처음 보는 사람이 끝까지 볼 확률 기준 1~5.
- 편집 아이디어는 바로 실행할 수 있게 구체적으로(어떤 B-roll/인서트, 어떤 자막 강조, 어디서 컷).
- 의료법 제56조(의료광고) 관점의 위험 표현을 compliance_flags에 적고 대안 표현을 제안합니다: 치료 효과 보장, 최고·유일·최초 같은 최상급, 다른 병원 비교·비방, 환자 치료경험담, 부작용 누락, 할인·가격 강조 등.
- 한국어로, 포토클리닉의 톤(차분하고 품격 있게, 과장 없이 진정성 있게)으로 작성합니다.`;

const seg = { type: "integer", minimum: 0 } as const;
const segRange = { start_seg: seg, end_seg: seg } as const;

export const VIDEO_INTERVIEW_TOOL_SCHEMA = {
  type: "object",
  properties: {
    title_candidates: { type: "array", items: { type: "string" }, description: "영상·웹진 제목 후보 3~5개" },
    content_type: { type: "string", enum: ["philosophy", "doctor_story", "supporters", "etc"] },
    blog_category: { type: "string", enum: ["monthly", "hospital", "doctor", "note", "branding", "news"] },
    one_line: { type: "string" },
    summary: { type: "string", description: "전체 요약 4~7문장" },
    keywords: { type: "array", items: { type: "string" } },
    speakers: {
      type: "array",
      items: { type: "object", properties: { label: { type: "string" }, description: { type: "string" } }, required: ["label", "description"] },
    },
    qa_blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_start_seg: { type: ["integer", "null"] },
          answer_start_seg: seg,
          answer_end_seg: seg,
          question: { type: "string", description: "들린 질문 원문 또는 추정 질문" },
          question_heard: { type: "boolean" },
          topic: { type: "string", description: "마커 이름용 15자 내외" },
          summary: { type: "string", description: "답변 요약 2~3문장" },
          key_points: { type: "array", items: { type: "string" } },
          best_quote: { type: ["string", "null"] },
          usefulness: { type: "integer", minimum: 1, maximum: 5 },
        },
        required: ["question_start_seg", "answer_start_seg", "answer_end_seg", "question", "question_heard", "topic", "summary", "usefulness"],
      },
    },
    quotes: {
      type: "array",
      description: "핵심 어록 5~10개",
      items: { type: "object", properties: { seg, text: { type: "string" }, use: { type: "string" } }, required: ["seg", "text", "use"] },
    },
    reels: {
      type: "array",
      description: "릴스 후보 3~8개",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          ...segRange,
          qa_index: { type: ["integer", "null"], description: "qa_blocks 배열의 0부터 시작하는 순번" },
          score: { type: "integer", minimum: 1, maximum: 5 },
          hook_text: { type: "string", description: "첫 화면 상단 고정 자막 15자 내외" },
          reason: { type: "string" },
          structure: { type: "string" },
          caption: { type: "string" },
          hashtags: { type: "array", items: { type: "string" } },
          subtitle_emphasis: { type: "array", items: { type: "string" } },
        },
        required: ["title", "start_seg", "end_seg", "score", "hook_text", "reason"],
      },
    },
    edit_ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ...segRange,
          type: { type: "string", enum: ["B-roll", "인서트촬영", "자막/그래픽", "컷편집", "음악/효과", "화면전환", "오프닝/엔딩"] },
          idea: { type: "string" },
        },
        required: ["start_seg", "end_seg", "type", "idea"],
      },
    },
    cut_suggestions: {
      type: "array",
      items: { type: "object", properties: { ...segRange, reason: { type: "string" } }, required: ["start_seg", "end_seg", "reason"] },
    },
    compliance_flags: {
      type: "array",
      items: {
        type: "object",
        properties: { seg, text: { type: "string" }, issue: { type: "string" }, suggestion: { type: "string" } },
        required: ["seg", "text", "issue", "suggestion"],
      },
    },
    webzine: {
      type: "object",
      properties: {
        headline: { type: "string" },
        subhead: { type: "string" },
        lead: { type: "string", description: "리드문 3~4문장" },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: { heading: { type: "string" }, body: { type: "string", description: "본문 초안 2~4문단" }, qa_index: { type: ["integer", "null"] } },
            required: ["heading", "body"],
          },
        },
        pull_quotes: { type: "array", items: { type: "string" } },
        seo_title: { type: "string" },
        seo_description: { type: "string" },
      },
      required: ["headline", "lead", "sections"],
    },
  },
  required: [
    "title_candidates", "content_type", "blog_category", "one_line", "summary", "qa_blocks",
    "quotes", "reels", "edit_ideas", "cut_suggestions", "compliance_flags", "webzine",
  ],
} as const;

export function buildInterviewUserMessage(segments: InterviewSegment[], context: string, durationSec: number): string {
  const lines = segments.map((segment) => transcriptLine(segment, (seconds) => formatClock(seconds))).join("\n");
  const hints = candidateBoundaries(segments);
  return [
    `촬영 정보: ${context.trim() || "(없음)"}`,
    `전체 길이: ${formatClock(durationSec)} / 문장 ${segments.length}개`,
    `질문 전환 후보 번호(신호 기반, 참고용): ${hints.length ? hints.join(", ") : "없음"}`,
    "",
    "<transcript>",
    lines,
    "</transcript>",
    "",
    `위 대본을 Q&A별로 나누고 정리해서 ${VIDEO_INTERVIEW_TOOL_NAME} 도구로 저장하세요.`,
  ].join("\n");
}
