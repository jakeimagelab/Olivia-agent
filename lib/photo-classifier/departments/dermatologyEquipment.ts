export type DermatologyEquipmentCategory = "lifting" | "rf" | "laser" | "skin_care" | "injection" | "unknown";

export type DermatologyEquipment = {
  canonicalName: string;
  aliases: readonly string[];
  category: DermatologyEquipmentCategory;
  procedureLabel: string;
};

/**
 * 피부과 Scene 이름에만 쓰는 표준 장비 사전이다. SceneType은 여전히 6종을 유지하고,
 * 이 사전은 treatment/skin_care Scene에 사람이 읽을 수 있는 이름을 붙일 때만 사용한다.
 */
export const DERMATOLOGY_EQUIPMENT: readonly DermatologyEquipment[] = [
  { canonicalName: "울쎄라", aliases: ["ulthera", "ultherapy", "울쎄라", "ultherapy transducer"], category: "lifting", procedureLabel: "울쎄라시술" },
  { canonicalName: "써마지", aliases: ["thermage", "thermage flx", "써마지"], category: "rf", procedureLabel: "써마지시술" },
  { canonicalName: "인모드", aliases: ["inmode", "forma", "fx", "mini fx", "인모드"], category: "lifting", procedureLabel: "인모드시술" },
  { canonicalName: "슈링크", aliases: ["shurink", "shurink universe", "슈링크"], category: "lifting", procedureLabel: "슈링크시술" },
  { canonicalName: "LDM", aliases: ["ldm", "ldm water", "엘디엠"], category: "skin_care", procedureLabel: "LDM관리" },
  { canonicalName: "실펌X", aliases: ["sylfirm", "sylfirm x", "실펌", "실펌x"], category: "rf", procedureLabel: "실펌X시술" },
  { canonicalName: "온다", aliases: ["onda", "온다"], category: "rf", procedureLabel: "온다시술" },
] as const;

export type DermatologyProcedureEvidence = {
  sceneType?: string | null;
  confidence?: number | null;
  equipmentPresent?: boolean | null;
  equipmentCategory?: string | null;
  equipmentName?: string | null;
  equipmentBrand?: string | null;
  handpiecePresent?: boolean | null;
  handpieceName?: string | null;
  syringePresent?: boolean | null;
  hasDoctor?: boolean | null;
  hasPatient?: boolean | null;
  procedureActionConfirmed?: boolean | null;
  procedureName?: string | null;
  procedureCategory?: string | null;
  procedureConfidence?: number | null;
  namingEvidence?: string[] | null;
  detectedCues?: string[] | null;
  consultationDeskPresent?: boolean | null;
};

export type DermatologyProcedureResolution = {
  label: string | null;
  procedureName: string | null;
  procedureCategory: string | null;
  confidence: number;
  evidence: string[];
};

function normalized(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US").replace(/[\s_\-()[\]{}·./]/g, "");
}

function normalizedEvidence(evidence: DermatologyProcedureEvidence): string[] {
  return [
    evidence.procedureName,
    evidence.equipmentName,
    evidence.equipmentBrand,
    evidence.handpieceName,
    ...(evidence.namingEvidence ?? []),
    ...(evidence.detectedCues ?? []),
  ].filter((value): value is string => Boolean(value?.trim())).map(normalized);
}

export function findDermatologyEquipment(evidence: DermatologyProcedureEvidence): DermatologyEquipment | null {
  const values = normalizedEvidence(evidence);
  for (const equipment of DERMATOLOGY_EQUIPMENT) {
    if (equipment.aliases.some((alias) => {
      const target = normalized(alias);
      return values.some((value) => value.includes(target));
    })) return equipment;
  }
  return null;
}

function boundedConfidence(value: number | null | undefined, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function categoryOf(evidence: DermatologyProcedureEvidence): DermatologyEquipmentCategory {
  const category = (evidence.procedureCategory ?? evidence.equipmentCategory ?? "").toLocaleLowerCase("en-US");
  if (/lifting|ulthera|ultherapy|shurink|inmode/.test(category)) return "lifting";
  if (/thermage|rf|onda|sylfirm/.test(category)) return "rf";
  if (/laser/.test(category)) return "laser";
  if (/skin_care|skin care|ldm|oxygen/.test(category)) return "skin_care";
  if (/injection|syringe|needle/.test(category)) return "injection";
  return "unknown";
}

function collectEvidence(evidence: DermatologyProcedureEvidence, extra: string[] = []): string[] {
  return Array.from(new Set([
    ...extra,
    ...(evidence.namingEvidence ?? []),
    ...(evidence.detectedCues ?? []),
  ].map((value) => value.trim()).filter(Boolean))).slice(0, 6);
}

function fallback(sceneType: string | null | undefined): DermatologyProcedureResolution {
  const label = sceneType === "consultation" ? "상담"
    : sceneType === "skin_care" ? "피부관리"
      : sceneType === "profile" ? "프로필"
        : sceneType === "interior" ? "인테리어"
          : sceneType === "treatment" ? "시술"
            : "기타";
  return { label, procedureName: null, procedureCategory: null, confidence: 0, evidence: [] };
}

/**
 * 대표 이미지 분석 결과를 Scene 단위로 모아 피부과 이름을 고른다.
 * 정확한 장비명은 0.80 이상일 때만 사용하고, 그보다 낮으면 카테고리/행위로 내려간다.
 */
export function resolveDermatologyProcedure(frameAnalyses: DermatologyProcedureEvidence[]): DermatologyProcedureResolution {
  const analyses = frameAnalyses.filter(Boolean);
  if (!analyses.length) return fallback(null);
  const primary = analyses[0];
  const exactVotes = new Map<string, { equipment: DermatologyEquipment; weight: number; count: number; evidence: string[] }>();

  for (const analysis of analyses) {
    const equipment = findDermatologyEquipment(analysis);
    if (!equipment) continue;
    const confidence = boundedConfidence(analysis.procedureConfidence, boundedConfidence(analysis.confidence, 0.5));
    const vote = exactVotes.get(equipment.canonicalName) ?? { equipment, weight: 0, count: 0, evidence: [] };
    vote.weight += confidence;
    vote.count += 1;
    vote.evidence.push(...collectEvidence(analysis, [`장비: ${equipment.canonicalName}`]));
    exactVotes.set(equipment.canonicalName, vote);
  }

  const exact = [...exactVotes.values()].sort((left, right) => right.weight - left.weight || right.count - left.count)[0];
  if (exact) {
    const confidence = exact.weight / exact.count;
    if (confidence >= 0.8) {
      return {
        label: exact.equipment.procedureLabel,
        procedureName: exact.equipment.canonicalName,
        procedureCategory: exact.equipment.category,
        confidence,
        evidence: Array.from(new Set(exact.evidence)).slice(0, 6),
      };
    }
  }

  const procedureAction = analyses.some((analysis) => analysis.procedureActionConfirmed === true);
  const actualInjection = analyses.some((analysis) => (
    analysis.syringePresent === true
    && analysis.hasDoctor === true
    && analysis.hasPatient === true
    && analysis.procedureActionConfirmed === true
  ));
  if (actualInjection) {
    return {
      label: "주사시술", procedureName: "주사", procedureCategory: "injection",
      confidence: Math.max(...analyses.map((analysis) => boundedConfidence(analysis.procedureConfidence, boundedConfidence(analysis.confidence, 0.65)))),
      evidence: collectEvidence(primary, ["환자에게 주사 시술 행동 확인"]),
    };
  }

  const categoryVotes = new Map<DermatologyEquipmentCategory, number>();
  for (const analysis of analyses) {
    const category = categoryOf(analysis);
    if (category === "unknown") continue;
    categoryVotes.set(category, (categoryVotes.get(category) ?? 0) + boundedConfidence(analysis.procedureConfidence, boundedConfidence(analysis.confidence, 0.5)));
  }
  // 이름까지 확정하지 못해도, 사전에 있는 장비에서 읽은 카테고리(예: Ultherapy → lifting)는
  // 잃지 않는다. 그래서 낮은 확신에서 "울쎄라"로 단정하지 않으면서도 리프팅시술로는 안내한다.
  const category = exact?.equipment.category
    ?? [...categoryVotes.entries()].sort((left, right) => right[1] - left[1])[0]?.[0]
    ?? "unknown";
  const categoryConfidence = exact
    ? exact.weight / exact.count
    : category === "unknown" ? 0 : (categoryVotes.get(category) ?? 0) / analyses.length;
  const patientProcedure = analyses.some((analysis) => analysis.hasPatient && (analysis.handpiecePresent || analysis.equipmentPresent || analysis.procedureActionConfirmed));

  if (categoryConfidence >= 0.55) {
    const labels: Record<DermatologyEquipmentCategory, [string, string]> = {
      lifting: ["리프팅시술", "리프팅"],
      rf: ["고주파시술", "고주파"],
      laser: ["레이저시술", "레이저"],
      skin_care: ["피부관리", "피부관리"],
      injection: ["피부시술", "피부시술"],
      unknown: ["장비시술", "장비"],
    };
    const [label, procedureName] = labels[category];
    return { label, procedureName, procedureCategory: category, confidence: categoryConfidence, evidence: collectEvidence(primary) };
  }

  if (primary.sceneType === "consultation" && primary.hasDoctor && primary.hasPatient && primary.consultationDeskPresent) {
    return { label: "원장상담", procedureName: "원장상담", procedureCategory: "consultation", confidence: boundedConfidence(primary.confidence, 0.65), evidence: collectEvidence(primary, ["의사·환자·상담 책상 확인"]) };
  }
  if (primary.sceneType === "skin_care") {
    return { label: "피부관리", procedureName: "피부관리", procedureCategory: "skin_care", confidence: boundedConfidence(primary.confidence, 0.6), evidence: collectEvidence(primary) };
  }
  if (procedureAction && patientProcedure) {
    return { label: primary.equipmentPresent ? "장비시술" : "피부시술", procedureName: primary.equipmentPresent ? "장비" : "피부", procedureCategory: "treatment", confidence: boundedConfidence(primary.confidence, 0.55), evidence: collectEvidence(primary) };
  }
  return fallback(primary.sceneType);
}
