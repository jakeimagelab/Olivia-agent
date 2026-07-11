import type { AiTrustGeneratedPrompt, AiTrustIntent } from "./types";

type GeneratePromptInput = {
  keywords: string[];
  region: string;
  department: string;
  treatments?: string[];
  symptoms?: string[];
  language?: string;
};

function detectIntent(keyword: string): AiTrustIntent {
  const k = keyword.toLowerCase();
  if (/추천|후기|잘하는|유명|평가|review|best/.test(k)) return "RECOMMENDATION";
  if (/가격|비용|가성비|이벤트|price|cost/.test(k)) return "PRICE";
  if (/불안|과잉|공장|강매|신뢰|안전|부작용/.test(k)) return "TRUST";
  if (/야간|주말|외국어|영어|중국어|여의사|예약|접근|parking|주차/.test(k)) return "CONDITION";
  if (/아픔|통증|증상|여드름|기미|홍조|흉터|탈모|붓기/.test(k)) return "SYMPTOM";
  if (/리쥬란|써마지|울쎄라|보톡스|필러|포텐자|임플란트|교정|라식|라섹/.test(k)) return "TREATMENT";
  return "LOCATION";
}

function buildQuestion(keyword: string, intent: AiTrustIntent, region: string, department: string) {
  const baseRegion = region || keyword;
  switch (intent) {
    case "RECOMMENDATION":
      return `${baseRegion} 근처에서 괜찮은 ${department} 추천해줘`;
    case "SYMPTOM":
      return `${baseRegion} 근처에서 ${keyword} 때문에 상담받기 좋은 ${department}는 어디야?`;
    case "TREATMENT":
      return `${baseRegion} 근처에서 ${keyword} 받으려면 어느 ${department}가 좋아?`;
    case "PRICE":
      return `${baseRegion} ${department} ${keyword} 비용과 선택 기준 알려줘`;
    case "TRUST":
      return `${baseRegion}에서 과잉진료 걱정 없이 신뢰할 만한 ${department}를 찾고 싶어`;
    case "CONDITION":
      return `${baseRegion} 근처에서 ${keyword} 조건에 맞는 ${department} 찾아줘`;
    case "LOCATION":
    default:
      return `${baseRegion} 주변 ${department} 찾아줘`;
  }
}

export function generateDemandBasedPrompts(input: GeneratePromptInput): AiTrustGeneratedPrompt[] {
  const keywords = [
    ...input.keywords,
    ...(input.treatments ?? []).map((item) => `${input.region} ${item}`),
    ...(input.symptoms ?? []).map((item) => `${input.region} ${item}`),
  ]
    .map((item) => item.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(keywords));

  return unique.map((keyword) => {
    const intent = detectIntent(keyword);
    return {
      source_keyword: keyword,
      source: "MANUAL",
      intent,
      question: buildQuestion(keyword, intent, input.region, input.department),
      language: input.language || "ko",
      region: input.region,
      department: input.department,
      demand_score: null,
    };
  });
}
