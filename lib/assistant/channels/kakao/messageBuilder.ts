import type {
  KakaoQuickReply,
  KakaoSkillResponse,
} from "@/lib/assistant/channels/kakao/types";

const SIMPLE_TEXT_MAX = 1_000;
const QUICK_REPLY_MAX = 10;
const QUICK_REPLY_LABEL_MAX = 14;
const QUICK_REPLY_TEXT_MAX = 400;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function buildKakaoTextResponse(
  text: string,
  quickReplies: KakaoQuickReply[] = [],
): KakaoSkillResponse {
  const normalized = text.trim() || "요청을 처리하지 못했습니다. 다시 말씀해 주세요.";
  const replies = quickReplies.slice(0, QUICK_REPLY_MAX).map((reply) => ({
    action: "message" as const,
    label: truncate(reply.label.trim(), QUICK_REPLY_LABEL_MAX),
    messageText: truncate(reply.messageText.trim(), QUICK_REPLY_TEXT_MAX),
  }));
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: truncate(normalized, SIMPLE_TEXT_MAX),
          },
        },
      ],
      ...(replies.length ? { quickReplies: replies } : {}),
    },
  };
}

export function buildKakaoCallbackResponse(
  waitingText = "요청을 확인하고 있어요. 잠시만 기다려 주세요.",
): KakaoSkillResponse {
  return {
    version: "2.0",
    useCallback: true,
    data: { text: truncate(waitingText, 200) },
  };
}

export function buildKakaoConfirmationResponse(input: {
  text: string;
  token: string;
}): KakaoSkillResponse {
  return buildKakaoTextResponse(input.text, [
    { label: "진행", messageText: `진행 ${input.token}` },
    { label: "취소", messageText: `취소 ${input.token}` },
  ]);
}

export function buildKakaoWebLinkResponse(input: {
  title: string;
  description: string;
  label: string;
  url: string;
}): KakaoSkillResponse {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          basicCard: {
            title: truncate(input.title, 50),
            description: truncate(input.description, 230),
            buttons: [
              {
                action: "webLink",
                label: truncate(input.label, 14),
                webLinkUrl: input.url,
              },
            ],
          },
        },
      ],
    },
  };
}
