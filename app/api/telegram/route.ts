import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USER_ID = process.env.TELEGRAM_ALLOWED_USER_ID;

const TOOL_LABELS: Record<string, string> = {
  create_quote:       "견적서 생성",
  create_contract:    "계약서 생성",
  send_file_transfer: "파일 전송",
  create_conti:       "콘티 생성",
  open_page:          "페이지 이동",
  calendar_add:       "일정 추가",
  calendar_add_bulk:  "일정 일괄 추가",
  calendar_list:      "할일 목록 조회",
  calendar_complete:  "완료 처리",
  calendar_delete:    "삭제",
  calendar_update:    "일정 수정",
  send_workflow_mail:    "워크플로우 메일 발송",
  get_workflow_status:   "워크플로우 현황 조회",
  advance_workflow_step: "워크플로우 단계 이동",
  list_mailing_queue:    "메일 대기 목록 조회",
  send_mailing:          "메일 발송",
  get_gallery:           "갤러리 조회",
  create_gallery:        "갤러리 등록",
};

async function tgRequest(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// 대화 히스토리 저장 (chat_id 포함)
async function saveChat(chatId: string, role: "user" | "assistant", content: string) {
  try {
    const db = getSupabaseAdmin();
    await db.from("olivia_chat_messages").insert({
      role, content, source: "telegram", chat_id: chatId,
    });
  } catch {}
}

// 최근 대화 히스토리 조회 (최대 10개)
async function getHistory(chatId: string): Promise<{ role: "user" | "assistant"; content: string }[]> {
  try {
    const db = getSupabaseAdmin();
    const { data } = await db
      .from("olivia_chat_messages")
      .select("role, content")
      .eq("chat_id", chatId)
      .eq("source", "telegram")
      .order("created_at", { ascending: false })
      .limit(10);
    if (!data || data.length === 0) return [];
    return (data as { role: "user" | "assistant"; content: string }[]).reverse();
  } catch {
    return [];
  }
}

async function getFilePath(fileId: string): Promise<string | null> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
  ).then(r => r.json());
  if (!res.ok) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${res.result.file_path}`;
}

async function transcribeVoice(buffer: ArrayBuffer): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return "[음성 메시지 수신됨 — OPENAI_API_KEY를 설정해주세요]";

  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/ogg" }), "voice.ogg");
  form.append("model", "whisper-1");
  form.append("language", "ko");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  }).then(r => r.json());

  return res.text || "[음성 인식 실패]";
}

function getBaseUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN 미설정" });

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId: number = message.chat.id;
  const chatIdStr = String(chatId);
  const userId = String(message.from?.id || "");

  if (ALLOWED_USER_ID && userId !== ALLOWED_USER_ID) {
    await tgRequest("sendMessage", { chat_id: chatId, text: "접근 권한이 없습니다." });
    return NextResponse.json({ ok: true });
  }

  let userText = message.text || message.caption || "";
  let imageBase64: string | null = null;
  const imageMime = "image/jpeg";

  // 사진 처리
  if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    const url = await getFilePath(photo.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      imageBase64 = Buffer.from(buf).toString("base64");
      if (!userText) userText = "이 사진 분석해줘";
    }
  }

  // 음성 처리
  if (message.voice) {
    const url = await getFilePath(message.voice.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      userText = await transcribeVoice(buf);
    }
  }

  // 이미지 파일 처리
  if (message.document && message.document.mime_type?.startsWith("image/")) {
    const url = await getFilePath(message.document.file_id);
    if (url) {
      const buf = await fetch(url).then(r => r.arrayBuffer());
      imageBase64 = Buffer.from(buf).toString("base64");
      if (!userText) userText = "이 사진 분석해줘";
    }
  }

  if (!userText && !imageBase64) {
    await tgRequest("sendMessage", {
      chat_id: chatId,
      text: "텍스트, 사진, 또는 음성 메시지를 보내주세요 💬📷🎙️",
    });
    return NextResponse.json({ ok: true });
  }

  await tgRequest("sendChatAction", { chat_id: chatId, action: "typing" });

  // 이전 대화 히스토리 가져오기
  const history = await getHistory(chatIdStr);

  // 현재 메시지 히스토리에 추가
  const userContent = userText || (imageBase64 ? "[📷 사진 전송됨]" : "");
  await saveChat(chatIdStr, "user", userContent);

  try {
    const base = getBaseUrl(req);

    // 히스토리 + 현재 메시지를 함께 전달
    const messages = [
      ...history,
      { role: "user" as const, content: userText },
    ];

    const oliviaRes = await fetch(`${base}/api/olivia`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": process.env.INTERNAL_API_KEY || "",
      },
      body: JSON.stringify({
        messages,
        imageBase64,
        imageMime,
        pageContext: "텔레그램 모바일 앱에서 접속 중. 승인 없이 도구를 바로 실행. 결과만 간결하게. 마크다운 최소화.",
      }),
    });

    const data = await oliviaRes.json();
    let reply: string;

    if (!data.ok) {
      reply = "⚠️ 오류: " + (data.error || "알 수 없는 오류");
    } else if (data.type === "tool_request") {
      const prefix = data.text ? data.text + "\n\n" : "";
      // 클로드가 한 번에 여러 도구(tool_use)를 요청할 수 있어(예: "일정 3개 등록해줘"),
      // 첫 번째 것만 실행하면 나머지가 조용히 버려져 사용자가 다시 요청해야 했다 — 전부 순차 실행.
      const tools = Array.isArray(data.tools) && data.tools.length ? data.tools : [data.tool];
      const lines: string[] = [];
      for (const tool of tools) {
        const label = TOOL_LABELS[tool?.name] || tool?.name || "작업";
        try {
          const execRes = await fetch(`${base}/api/olivia`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-key": process.env.INTERNAL_API_KEY || "",
              "x-base-url": base,
            },
            body: JSON.stringify({ pendingTool: tool }),
          });
          const execData = await execRes.json();
          if (execData.ok && execData.toolResult) {
            const result = execData.toolResult;
            lines.push(result.action === "navigate"
              ? (result.message || "완료됐어요!") + `\n🔗 ${base}${result.url}`
              : (result.message || "완료됐어요!"));
          } else {
            lines.push(`⚠️ ${label} 실행 실패`);
          }
        } catch (e: any) {
          lines.push(`⚠️ ${label} 실행 중 오류: ${e.message}`);
        }
      }
      reply = prefix + lines.join("\n\n");
    } else {
      reply = data.text || "처리됐어요!";
    }

    // 응답 저장
    await saveChat(chatIdStr, "assistant", reply);

    // 4096자 초과 시 분할 전송
    for (let i = 0; i < reply.length; i += 4000) {
      await tgRequest("sendMessage", {
        chat_id: chatId,
        text: reply.slice(i, i + 4000),
        parse_mode: "Markdown",
      });
    }
  } catch (e: any) {
    await tgRequest("sendMessage", {
      chat_id: chatId,
      text: "⚠️ 연결 오류: " + e.message,
    });
  }

  return NextResponse.json({ ok: true });
}
