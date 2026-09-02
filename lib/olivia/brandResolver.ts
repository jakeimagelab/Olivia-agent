import type { Brand } from "@/lib/quote/quoteFormTypes";

const EXPLICIT_JAKEIMAGE = /(?:제이크\s*이미지(?:\s*연구소)?|jake\s*image(?:\s*lab)?)/i;
const EXPLICIT_PHOTOCLINIC = /(?:포토\s*클리닉|photo\s*clinic)/i;

// 기관 유형과 진료과처럼 그 자체로 의료 고객임을 강하게 나타내는 표현만 둔다.
// "원장"처럼 학원·미용실에서도 흔히 쓰는 단어 하나만으로는 브랜드를 단정하지 않는다.
const MEDICAL_CONTEXT = /(?:병원|의원|의료원|클리닉|한의원|한방병원|치과|산부인과|피부과|성형외과|정형외과|신경외과|흉부외과|내과|외과|소아과|소아청소년과|정신건강의학과|비뇨(?:기|의학)과|재활의학과|마취통증의학과|영상의학과|가정의학과|안과|이비인후과|통증의학과|검진센터|건강검진|의료진|환자|진료|시술|수술|hospital|clinic|medical\s*center|dermatolog|dental)/i;

function knownBrand(value: unknown): Brand | undefined {
  if (value === "photoclinic" || value === "jakeimage") return value;
  return undefined;
}

export type DocumentBrandResolutionInput = {
  message?: string;
  contextBrand?: unknown;
  activeClientName?: string;
};

/**
 * 문서 생성에 사용할 브랜드를 결정한다.
 * 현재 요청의 명시값 > 실제 PageContext > 의료 문맥 순이며, 모호하면 undefined를 반환한다.
 */
export function resolveDocumentBrand({
  message = "",
  contextBrand,
  activeClientName = "",
}: DocumentBrandResolutionInput): Brand | undefined {
  if (EXPLICIT_JAKEIMAGE.test(message)) return "jakeimage";
  if (EXPLICIT_PHOTOCLINIC.test(message)) return "photoclinic";

  const contextualBrand = knownBrand(contextBrand);
  if (contextualBrand) return contextualBrand;

  return MEDICAL_CONTEXT.test(`${message} ${activeClientName}`) ? "photoclinic" : undefined;
}

export function isKnownDocumentBrand(value: unknown): value is Brand {
  return knownBrand(value) !== undefined;
}
