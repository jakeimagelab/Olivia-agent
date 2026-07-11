export type ExtractedHospitalMention = {
  raw_name: string;
  rank: number | null;
  mention_context: "RECOMMENDED" | "NEUTRAL" | "NEGATIVE" | "COMPARISON";
  snippet: string;
  confidence: number;
};

const NEGATIVE_PATTERNS = /(추천하지|비추천|피하는|권하지|부정적|주의)/;
const COMPARISON_PATTERNS = /(비교|반면|보다|대신|차이)/;
const RECOMMEND_PATTERNS = /(추천|유명|좋은|괜찮은|잘하는|인기|평이 좋은|후기)/;

export function extractHospitalMentions(rawResponse: string): ExtractedHospitalMention[] {
  const lines = rawResponse.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const mentions: ExtractedHospitalMention[] = [];
  const seen = new Set<string>();

  lines.forEach((line, lineIndex) => {
    const candidates = line.match(/[가-힣A-Za-z0-9&·.\-\s]{2,40}(?:병원|의원|클리닉|피부과|치과|성형외과|안과|한의원|내과|외과|Dermatology|Clinic|Hospital)/g) || [];
    candidates.forEach((candidate, candidateIndex) => {
      const rawName = normalizeSpacing(candidate);
      const key = rawName.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      mentions.push({
        raw_name: rawName,
        rank: lineIndex + candidateIndex + 1,
        mention_context: classifyMentionContext(line),
        snippet: line.slice(0, 500),
        confidence: 0.72,
      });
    });
  });

  return mentions;
}

export function canonicalizeHospitalName(name: string) {
  return normalizeSpacing(name)
    .replace(/\s+(Dermatology|Clinic|Hospital)$/i, " $1")
    .trim();
}

function normalizeSpacing(value: string) {
  return value.replace(/\s+/g, " ").replace(/[,:;]+$/g, "").trim();
}

function classifyMentionContext(snippet: string): ExtractedHospitalMention["mention_context"] {
  if (NEGATIVE_PATTERNS.test(snippet)) return "NEGATIVE";
  if (COMPARISON_PATTERNS.test(snippet)) return "COMPARISON";
  if (RECOMMEND_PATTERNS.test(snippet)) return "RECOMMENDED";
  return "NEUTRAL";
}
