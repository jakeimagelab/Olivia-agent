type ResponseRow = {
  id: string;
  provider: string;
  prompt_id: string;
};

type PromptRow = {
  id: string;
  intent: string;
};

type MentionRow = {
  hospital_id: string | null;
  response_id: string;
  rank: number | null;
  mention_context: string;
};

export function calculateConsensusStats(responses: ResponseRow[], prompts: PromptRow[], mentions: MentionRow[]) {
  const responseMap = new Map(responses.map((response) => [response.id, response]));
  const promptMap = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const totalResponses = Math.max(responses.length, 1);
  const byHospital = new Map<string, MentionRow[]>();

  mentions
    .filter((mention) => mention.hospital_id && mention.mention_context === "RECOMMENDED")
    .forEach((mention) => {
      const key = mention.hospital_id as string;
      byHospital.set(key, [...(byHospital.get(key) || []), mention]);
    });

  return Array.from(byHospital.entries()).map(([hospitalId, rows]) => {
    const responseIds = new Set(rows.map((row) => row.response_id));
    const top1 = rows.filter((row) => row.rank === 1).length;
    const top3 = rows.filter((row) => row.rank !== null && row.rank <= 3).length;
    const providers = new Set(rows.map((row) => responseMap.get(row.response_id)?.provider).filter(Boolean));
    const intents = new Set(
      rows
        .map((row) => responseMap.get(row.response_id)?.prompt_id)
        .map((promptId) => (promptId ? promptMap.get(promptId)?.intent : null))
        .filter(Boolean),
    );

    const promptRepeatMap = new Map<string, number>();
    rows.forEach((row) => {
      const promptId = responseMap.get(row.response_id)?.prompt_id;
      if (!promptId) return;
      promptRepeatMap.set(promptId, (promptRepeatMap.get(promptId) || 0) + 1);
    });
    const repeatValues = Array.from(promptRepeatMap.values());
    const repeatStability = repeatValues.length
      ? repeatValues.reduce((sum, value) => sum + Math.min(value / 5, 1), 0) / repeatValues.length
      : 0;

    return {
      hospital_id: hospitalId,
      mention_rate: responseIds.size / totalResponses,
      top1_rate: top1 / totalResponses,
      top3_rate: top3 / totalResponses,
      provider_consensus: providers.size,
      intent_coverage: intents.size,
      repeat_stability: repeatStability,
      metrics: {
        recommended_mentions: rows.length,
        unique_responses: responseIds.size,
        providers: Array.from(providers),
        intents: Array.from(intents),
      },
    };
  });
}
