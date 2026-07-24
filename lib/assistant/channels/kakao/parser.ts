import type {
  KakaoSkillPayload,
  ParsedKakaoSkillRequest,
} from "@/lib/assistant/channels/kakao/types";
import {
  AssistantValidationError,
  optionalText,
  requireRecord,
  requireText,
} from "@/lib/assistant/validation";

export function parseKakaoSkillPayload(
  payload: unknown,
): ParsedKakaoSkillRequest {
  const root = requireRecord(payload, "카카오 요청", 200_000);
  const userRequest = requireRecord(
    root.userRequest,
    "카카오 사용자 요청",
    100_000,
  );
  const user = requireRecord(userRequest.user, "카카오 사용자", 20_000);
  const properties =
    user.properties && typeof user.properties === "object"
      ? (user.properties as Record<string, unknown>)
      : {};

  const botUserKey = requireText(
    properties.botUserKey ?? user.id,
    "카카오 사용자 식별자",
    { max: 70 },
  );
  const utterance = requireText(userRequest.utterance, "카카오 메시지", {
    max: 10_000,
  });
  const callbackUrl = optionalText(
    userRequest.callbackUrl,
    "카카오 Callback URL",
    2_000,
  );
  if (callbackUrl) {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl);
    } catch {
      throw new AssistantValidationError("카카오 Callback URL이 올바르지 않습니다.");
    }
    if (
      parsed.protocol !== "https:" ||
      !(parsed.hostname === "kakao.com" || parsed.hostname.endsWith(".kakao.com"))
    ) {
      throw new AssistantValidationError("허용되지 않은 Callback URL입니다.");
    }
  }

  const typed = root as unknown as KakaoSkillPayload;
  return {
    utterance,
    botUserKey,
    plusfriendUserKey: optionalText(
      properties.plusfriendUserKey,
      "카카오 채널 사용자 식별자",
      100,
    ),
    appUserId: optionalText(properties.appUserId, "카카오 앱 사용자 식별자", 100),
    isFriend:
      typeof properties.isFriend === "boolean"
        ? properties.isFriend
        : undefined,
    callbackUrl,
    timezone:
      optionalText(userRequest.timezone, "시간대", 80) || "Asia/Seoul",
    lang: optionalText(userRequest.lang, "언어", 20) || "ko",
    botId: optionalText(typed.bot?.id, "카카오 봇 ID", 100),
    blockId: optionalText(typed.userRequest.block?.id, "카카오 블록 ID", 100),
    actionParams:
      typed.action?.params && typeof typed.action.params === "object"
        ? typed.action.params
        : {},
    clientExtra:
      typed.action?.clientExtra &&
      typeof typed.action.clientExtra === "object"
        ? typed.action.clientExtra
        : {},
  };
}

export function parseKakaoLinkCommand(
  utterance: string,
): { code: string } | null {
  const matched = utterance
    .trim()
    .match(/^올리비아\s*연결(?:해줘)?\s+(\d{6})$/);
  return matched ? { code: matched[1] } : null;
}

export function parseKakaoConfirmationCommand(
  utterance: string,
): { decision: "confirm" | "cancel"; token: string } | null {
  const matched = utterance
    .trim()
    .match(/^(진행|확인|승인|취소)\s+([A-Za-z0-9_-]{16,100})$/);
  if (!matched) return null;
  return {
    decision: matched[1] === "취소" ? "cancel" : "confirm",
    token: matched[2],
  };
}
