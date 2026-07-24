import type { KakaoSkillResponse } from "@/lib/assistant/channels/kakao/types";

const CALLBACK_TIMEOUT_MS = 4_000;
const EVENT_TIMEOUT_MS = 8_000;

export class KakaoNotConfiguredError extends Error {
  readonly code = "KAKAO_NOT_CONFIGURED";

  constructor(message = "카카오 채널 연동 환경변수가 설정되지 않았습니다.") {
    super(message);
    this.name = "KakaoNotConfiguredError";
  }
}

function withTimeout(ms: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export async function sendKakaoCallback(
  callbackUrl: string,
  response: KakaoSkillResponse,
) {
  const url = new URL(callbackUrl);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "kakao.com" || url.hostname.endsWith(".kakao.com"))
  ) {
    throw new Error("허용되지 않은 카카오 Callback URL입니다.");
  }
  const timeout = withTimeout(CALLBACK_TIMEOUT_MS);
  try {
    const result = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
      signal: timeout.signal,
      cache: "no-store",
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !["SUCCESS"].includes(String(data.status || ""))) {
      throw new Error("카카오 Callback 전달에 실패했습니다.");
    }
    return {
      taskId: String(data.taskId || ""),
      status: String(data.status || ""),
    };
  } finally {
    timeout.clear();
  }
}

export async function sendKakaoEvent(input: {
  eventName: string;
  userType: "appUserId" | "plusfriendUserKey" | "botUserKey";
  userId: string;
  data?: Record<string, string>;
}) {
  const botId = process.env.KAKAO_BOT_ID;
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!botId || !restApiKey) throw new KakaoNotConfiguredError();

  const timeout = withTimeout(EVENT_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://bot-api.kakao.com/v2/bots/${encodeURIComponent(botId)}/talk`,
      {
        method: "POST",
        headers: {
          Authorization: `KakaoAK ${restApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: { name: input.eventName, data: input.data ?? {} },
          user: [{ type: input.userType, id: input.userId }],
        }),
        signal: timeout.signal,
        cache: "no-store",
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.taskId) {
      throw new Error("카카오 Event API 요청에 실패했습니다.");
    }
    return { taskId: String(data.taskId), status: String(data.status || "") };
  } finally {
    timeout.clear();
  }
}
