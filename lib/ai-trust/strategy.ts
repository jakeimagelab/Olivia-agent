import { AI_TRUST_EVIDENCE_SCHEMAS } from "./constants";

type GapRow = {
  id?: string;
  schema_key: string;
  gap: number;
  recommended_avg: number;
  client_score: number;
};

export function buildStrategiesFromGaps(gaps: GapRow[]) {
  return gaps
    .filter((gap) => gap.gap > 15)
    .slice(0, 8)
    .map((gap, index) => {
      const schema = AI_TRUST_EVIDENCE_SCHEMAS.find((item) => item.key === gap.schema_key);
      return {
        title: `${schema?.label || gap.schema_key} 보강 전략`,
        category: gap.schema_key,
        priority: index + 1,
        summary: `추천 병원군 평균보다 ${Math.round(gap.gap)}점 낮게 관찰된 영역을 우선 보강합니다.`,
        rationale: [
          { label: "추천 병원군 평균", value: gap.recommended_avg },
          { label: "클라이언트 점수", value: gap.client_score },
          { label: "Trust Gap", value: gap.gap },
        ],
        linked_gap_ids: gap.id ? [gap.id] : [],
      };
    });
}

export function buildShootPlanFromStrategies(strategies: { id?: string; title: string; category: string; priority: number }[]) {
  return strategies.flatMap((strategy) => {
    const base = {
      strategy_id: strategy.id || null,
      evidence_schema: strategy.category,
      trust_gap: strategy.title,
      priority: strategy.priority,
    };
    return [
      {
        ...base,
        title: `${strategy.title} · 증거컷`,
        description: "해당 신뢰 격차를 직접 설명할 수 있는 실제 상담, 공간, 의료진, 정보 안내 장면을 촬영합니다.",
        shot_type: "EVIDENCE",
        photo_required: true,
        video_required: true,
      },
      {
        ...base,
        title: `${strategy.title} · 텍스트 보조컷`,
        description: "홈페이지, 블로그, 플레이스에서 근거 문장과 함께 사용할 정보 전달형 컷을 확보합니다.",
        shot_type: "TEXT_SUPPORT",
        photo_required: true,
        video_required: false,
      },
    ];
  });
}
