import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveClientId } from "@/lib/clientLookup";
import type { OliviaChatWorkItem } from "@/lib/olivia/chatTypes";
import { createEventDeduplicationKey, emitOliviaEvent } from "@/lib/olivia/events";
import { sendTelegramNotification } from "@/lib/telegramNotifications";

export type ClientCandidateSource = "quote" | "conti" | "prompter";

type CandidateInput = {
  hospitalName: string;
  sourceType: ClientCandidateSource;
  sourceRecordId: string;
};

const SOURCE_LABEL: Record<ClientCandidateSource, string> = {
  quote: "견적",
  conti: "콘티",
  prompter: "프롬프터",
};

const SOURCE_STEP: Record<ClientCandidateSource, string> = {
  quote: "quote",
  conti: "conti",
  prompter: "consult_meeting",
};

function validHospitalName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120) return "";
  if (["병원명 없음", "미정", "테스트", "새 프로젝트"].includes(name)) return "";
  return name;
}

export async function registerClientCandidate(db: SupabaseClient, input: CandidateInput) {
  const hospitalName = validHospitalName(input.hospitalName);
  if (!hospitalName || await resolveClientId(db, hospitalName)) return null;

  const deduplicationKey = createEventDeduplicationKey("client.registration_suggested", input.sourceType, input.sourceRecordId);
  const { data: duplicate } = await db.from("olivia_events").select("id").eq("deduplication_key", deduplicationKey).maybeSingle();
  if (duplicate) return null;

  const suggestedStep = SOURCE_STEP[input.sourceType];
  const sourceLabel = SOURCE_LABEL[input.sourceType];
  const event = await emitOliviaEvent(db, {
    eventType: "client.registration_suggested",
    eventSource: `${input.sourceType}_api`,
    payload: { hospitalName, sourceType: input.sourceType, sourceRecordId: input.sourceRecordId, suggestedStep },
    deduplicationKey,
  });

  const { data: insights, error: insightError } = await db.rpc("upsert_olivia_insight", {
    p_insight: {
      insight_type: "opportunity",
      title: `${hospitalName} 신규 고객 등록 제안`,
      summary: `${sourceLabel} DB에서 아직 고객관리에 없는 병원명을 발견했습니다.`,
      reason: "기능별 저장 데이터와 고객 워크플로를 연결하면 이후 업무와 자료를 한곳에서 추적할 수 있습니다.",
      event_id: event.id,
      priority_score: 72,
      urgency_score: 55,
      impact_score: 82,
      confidence: 0.96,
      recommended_action: `${hospitalName} 고객등록 확인`,
      deduplication_key: createEventDeduplicationKey("client.registration_insight", input.sourceType, input.sourceRecordId),
    },
  });
  if (insightError) throw new Error(insightError.message);

  const insight = Array.isArray(insights) ? insights[0] : insights;
  const workItem: OliviaChatWorkItem = {
    id: event.id,
    kind: "client_candidate",
    title: `${hospitalName} 고객등록 해드릴까요?`,
    summary: `${sourceLabel}에서 신규 병원을 발견했습니다. 등록하면 ${suggestedStep === "consult_meeting" ? "기본 고객 워크플로" : `${sourceLabel} 단계`}로 연결합니다.`,
    clientName: hospitalName,
    priorityScore: 72,
    status: "등록 확인 필요",
    metadata: { eventId: event.id, hospitalName, sourceType: input.sourceType, sourceRecordId: input.sourceRecordId, suggestedStep, insightId: insight?.id },
    availableActions: ["register", "dismiss"],
  };

  const message = `🏥 ${sourceLabel}에서 새로운 병원명 “${hospitalName}”을 발견했어요. 고객관리 신규등록을 진행할까요?`;
  const { error: messageError } = await db.from("olivia_chat_messages").insert({
    role: "assistant",
    content: message,
    source: "web",
    metadata: { workItems: [workItem] },
  });
  if (messageError) console.error("[client-candidate] 올리비아 채팅 저장 실패", messageError.message);

  await sendTelegramNotification(`🏥 올리비아 신규 고객 감지\n\n${sourceLabel}에서 “${hospitalName}”을 발견했습니다.\n올리비아 웹 채팅에서 고객등록 여부를 확인해주세요.`)
    .catch((error) => console.error("[client-candidate] 텔레그램 발송 실패", error instanceof Error ? error.message : error));

  return { event, insight, workItem };
}
