import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseAdmin } from "@/lib/supabase";

// 팀챗 안의 올리비아는 app/api/olivia/route.ts의 CRM 툴콜 에이전트와는 별개로,
// 같은 ANTHROPIC_API_KEY만 재사용하는 대화 전용(툴콜 없음) 참여자다. 여러 프로바이더를
// 지원하는 works-saas의 agents/agent_secrets 구조는 이식하지 않았다 — 이 앱은
// "올리비아" 하나만 있으면 되기 때문이다.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 올리비아, 포토클리닉(병원 브랜딩 사진 스튜디오) 팀 채팅에 참여하는 AI 동료입니다.
직원들의 대화를 보고 자연스럽고 간결하게 한국어로 대답하세요. 이모지는 과하지 않게 사용하고,
확실하지 않은 사실은 지어내지 말고 모른다고 말하세요. 이 대화 안에서는 예약/견적/계약 같은
실제 업무를 실행할 수 없으니, 그런 요청이 오면 관리자 화면에서 직접 처리해달라고 안내하세요.`;

export async function generateOliviaReply(roomId: string): Promise<void> {
  const db = getSupabaseAdmin();

  const { data: messages } = await db
    .from("chat_messages")
    .select("sender_type,sender_member_id,body,created_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (messages ?? []).reverse();
  if (!history.length) return;

  const memberIds = Array.from(
    new Set(history.filter((m) => m.sender_type === "member" && m.sender_member_id).map((m) => m.sender_member_id as string))
  );
  const { data: members } = memberIds.length
    ? await db.from("chat_members").select("id,display_name").in("id", memberIds)
    : { data: [] };
  const nameById = new Map((members ?? []).map((m) => [m.id, m.display_name]));

  const anthropicMessages = history.map((m) => ({
    role: m.sender_type === "olivia" ? ("assistant" as const) : ("user" as const),
    content: m.sender_type === "olivia" ? m.body : `${nameById.get(m.sender_member_id ?? "") ?? "팀원"}: ${m.body}`,
  }));

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: anthropicMessages,
  });

  const replyText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!replyText) return;

  await db.from("chat_messages").insert({
    room_id: roomId,
    sender_type: "olivia",
    sender_member_id: null,
    body: replyText,
  });
}
