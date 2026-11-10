export type ExtractedHospitalMention = {
  raw_name: string;
  rank: number | null;
  mention_context: "RECOMMENDED" | "NEUTRAL" | "NEGATIVE" | "COMPARISON";
  snippet: string;
  confidence: number;
  source_url?: string | null;
};

export type MatchableClinic = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  aliases?: string[];
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

export async function extractHospitalMentionsWithLlm(
  rawResponse: string,
  sourceUrls: string[],
): Promise<{ mentions: ExtractedHospitalMention[]; method: "llm" | "fallback" }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.AI_TRUST_EXTRACT_MODEL?.trim();
  if (!apiKey || !model) return { mentions: extractHospitalMentions(rawResponse), method: "fallback" };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model,
        store: false,
        input: `다음 AI 답변에서 병원·의원·클리닉 이름만 추출하세요. 등장 순서, 맥락, 직접 근거 문장, 함께 인용된 URL을 반환하세요. 답변에 없는 병원은 만들지 마세요.\n\n출처 후보:\n${sourceUrls.join("\n")}\n\n답변:\n${rawResponse}`,
        text: {
          format: {
            type: "json_schema",
            name: "hospital_mentions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                mentions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      hospital_name: { type: "string" },
                      order: { type: ["integer", "null"] },
                      context: { type: "string", enum: ["RECOMMENDED", "NEUTRAL", "NEGATIVE", "COMPARISON"] },
                      evidence_sentence: { type: "string" },
                      source_url: { type: ["string", "null"] },
                    },
                    required: ["hospital_name", "order", "context", "evidence_sentence", "source_url"],
                  },
                },
              },
              required: ["mentions"],
            },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`extract failed ${response.status}`);
    const data = await response.json() as Record<string, unknown>;
    const output = Array.isArray(data.output) ? data.output as Array<Record<string, unknown>> : [];
    const text = output.flatMap((item) => Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [])
      .map((part) => typeof part.text === "string" ? part.text : "").filter(Boolean).join("");
    const parsed = JSON.parse(text) as { mentions?: Array<Record<string, unknown>> };
    const mentions = (parsed.mentions || []).map((item) => ({
      raw_name: String(item.hospital_name || "").trim(),
      rank: typeof item.order === "number" ? item.order : null,
      mention_context: String(item.context || "NEUTRAL") as ExtractedHospitalMention["mention_context"],
      snippet: String(item.evidence_sentence || "").slice(0, 500),
      source_url: typeof item.source_url === "string" && item.source_url ? item.source_url : null,
      confidence: 0.9,
    })).filter((item) => item.raw_name);
    return { mentions, method: "llm" };
  } catch {
    return { mentions: extractHospitalMentions(rawResponse), method: "fallback" };
  }
}

export function matchHospitalMention(mention: ExtractedHospitalMention, clinics: MatchableClinic[]) {
  const needle = normalizeClinicForMatch(mention.raw_name);
  let best: { clinic: MatchableClinic; confidence: number } | null = null;
  for (const clinic of clinics) {
    const names = [clinic.normalized_name, clinic.canonical_name, ...(clinic.aliases || [])].map(normalizeClinicForMatch);
    const nameScore = Math.max(...names.map((candidate) => similarity(needle, candidate)));
    const domain = mention.source_url ? safeDomain(mention.source_url) : "";
    const domainBonus = domain && clinic.website && safeDomain(clinic.website) === domain ? 0.18 : 0;
    const confidence = Math.min(1, nameScore + domainBonus);
    if (!best || confidence > best.confidence) best = { clinic, confidence };
  }
  if (best === null) return { clinic: null, confidence: 0, status: "REVIEW" as const };
  if (best.confidence < 0.62) return { clinic: null, confidence: best.confidence, status: "REVIEW" as const };
  return { clinic: best.clinic, confidence: best.confidence, status: best.confidence >= 0.84 ? "MATCHED" as const : "REVIEW" as const };
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

function normalizeClinicForMatch(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[()（）·.,\-]/g, "");
}

function similarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.12;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[right.length];
}

function safeDomain(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
}
