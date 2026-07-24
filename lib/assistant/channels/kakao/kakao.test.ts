import { describe, expect, it } from "vitest";
import {
  buildKakaoCallbackResponse,
  buildKakaoConfirmationResponse,
  buildKakaoTextResponse,
} from "@/lib/assistant/channels/kakao/messageBuilder";
import {
  parseKakaoConfirmationCommand,
  parseKakaoLinkCommand,
  parseKakaoSkillPayload,
} from "@/lib/assistant/channels/kakao/parser";

const payload = {
  userRequest: {
    utterance: "오늘 일정 알려줘",
    timezone: "Asia/Seoul",
    lang: "ko",
    user: {
      id: "bot-user-1",
      type: "botUserKey",
      properties: {
        plusfriendUserKey: "channel-user-1",
        isFriend: true,
      },
    },
  },
  bot: { id: "bot-1" },
  action: { params: {}, clientExtra: {} },
};

describe("Kakao channel adapter", () => {
  it("공식 SkillPayload에서 사용자와 발화를 읽는다", () => {
    expect(parseKakaoSkillPayload(payload)).toMatchObject({
      utterance: "오늘 일정 알려줘",
      botUserKey: "bot-user-1",
      plusfriendUserKey: "channel-user-1",
      isFriend: true,
      timezone: "Asia/Seoul",
    });
  });

  it("사용자 ID가 없으면 거부한다", () => {
    expect(() =>
      parseKakaoSkillPayload({
        userRequest: { utterance: "안녕", user: {} },
      }),
    ).toThrow("카카오 사용자 식별자");
  });

  it("카카오 연결 명령을 분리한다", () => {
    expect(parseKakaoLinkCommand("올리비아 연결 123456")).toEqual({
      code: "123456",
    });
    expect(parseKakaoLinkCommand("오늘 일정 알려줘")).toBeNull();
  });

  it("승인과 취소 명령을 token에 연결한다", () => {
    const token = "abcDEF_1234567890-token";
    expect(parseKakaoConfirmationCommand(`진행 ${token}`)).toEqual({
      decision: "confirm",
      token,
    });
    expect(parseKakaoConfirmationCommand(`취소 ${token}`)).toEqual({
      decision: "cancel",
      token,
    });
  });

  it("텍스트와 quick reply 제한을 지킨다", () => {
    const response = buildKakaoTextResponse(
      "가".repeat(1_500),
      Array.from({ length: 12 }, (_, index) => ({
        label: `아주 긴 버튼 이름 ${index}`,
        messageText: `선택 ${index}`,
      })),
    );
    const output = response.template?.outputs[0];
    expect(output && "simpleText" in output ? output.simpleText.text.length : 0).toBe(
      1_000,
    );
    expect(response.template?.quickReplies).toHaveLength(10);
    expect(response.template?.quickReplies?.[0].label.length).toBeLessThanOrEqual(
      14,
    );
  });

  it("Callback 대기 응답에는 template을 넣지 않는다", () => {
    const response = buildKakaoCallbackResponse();
    expect(response).toMatchObject({ version: "2.0", useCallback: true });
    expect(response.template).toBeUndefined();
  });

  it("승인 응답은 진행과 취소 버튼을 제공한다", () => {
    const response = buildKakaoConfirmationResponse({
      text: "일정을 등록할까요?",
      token: "abcDEF_1234567890-token",
    });
    expect(response.template?.quickReplies?.map((item) => item.label)).toEqual([
      "진행",
      "취소",
    ]);
  });
});
