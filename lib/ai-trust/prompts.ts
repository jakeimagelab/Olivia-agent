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

export function generateGeoRadarPrompts(input: GeneratePromptInput): AiTrustGeneratedPrompt[] {
  const region = input.region.trim();
  const department = input.department.trim();
  const treatment = input.treatments?.[0]?.trim() || "대표 시술";
  const candidates: Array<{ intent: AiTrustIntent; keyword: string; question: string }> = [
    { intent: "LOCATION", keyword: region, question: `${region} 주변 ${department}를 찾아줘` },
    { intent: "RECOMMENDATION", keyword: `${region} 추천`, question: `${region} 근처에서 괜찮은 ${department} 추천해줘` },
    { intent: "RECOMMENDATION", keyword: `${region} 잘하는 곳`, question: `${region}에서 평이 좋고 진료를 잘하는 ${department}는 어디야?` },
    { intent: "TREATMENT", keyword: treatment, question: `${region} 근처에서 ${treatment} 받으려면 어느 ${department}가 좋아?` },
    { intent: "PRICE", keyword: `${treatment} 가격`, question: `${region} ${treatment} 비용과 병원 선택 기준을 알려줘` },
    { intent: "TRUST", keyword: `${region} 신뢰`, question: `${region}에서 과잉진료 걱정 없이 신뢰할 만한 ${department}를 찾고 싶어` },
    { intent: "CONDITION", keyword: `${region} 상담`, question: `${region}에서 상담을 꼼꼼하게 해주는 ${department} 추천해줘` },
    { intent: "CONDITION", keyword: `${region} 예약`, question: `${region}에서 예약과 접근이 편한 ${department}는 어디야?` },
    { intent: "RECOMMENDATION", keyword: `${region} 후기`, question: `${region} ${department} 중 후기와 의료진 정보를 함께 비교해줘` },
    { intent: "TRUST", keyword: `${region} 안전`, question: `${region} ${department} 중 안전 정보와 부작용 안내가 잘 된 곳을 추천해줘` },
    { intent: "CONDITION", keyword: `${region} 조건`, question: `${region}에서 시설과 장비 정보를 확인할 수 있는 ${department}를 알려줘` },
    { intent: "RECOMMENDATION", keyword: `${region} 종합`, question: `${region} 주변 ${department}를 여러 출처를 바탕으로 순위와 이유를 함께 추천해줘` },
  ];
  return candidates.map((item) => ({
    source_keyword: item.keyword, source: "GEO_RADAR_V1", intent: item.intent, question: item.question,
    language: input.language || "ko", region, department, demand_score: null,
  }));
}
