export type KakaoSkillUser = {
  id: string;
  type?: string;
  properties?: {
    botUserKey?: string;
    plusfriendUserKey?: string;
    appUserId?: string;
    isFriend?: boolean;
    [key: string]: unknown;
  };
};

export type KakaoSkillPayload = {
  intent?: {
    id?: string;
    name?: string;
    extra?: Record<string, unknown>;
  };
  userRequest: {
    callbackUrl?: string;
    timezone?: string;
    params?: Record<string, unknown>;
    block?: { id?: string; name?: string };
    utterance: string;
    lang?: string;
    user: KakaoSkillUser;
  };
  bot?: { id?: string; name?: string };
  action?: {
    id?: string;
    name?: string;
    params?: Record<string, unknown>;
    detailParams?: Record<string, unknown>;
    clientExtra?: Record<string, unknown> | null;
  };
  contexts?: unknown[];
};

export type ParsedKakaoSkillRequest = {
  utterance: string;
  botUserKey: string;
  plusfriendUserKey?: string;
  appUserId?: string;
  isFriend?: boolean;
  callbackUrl?: string;
  timezone: string;
  lang: string;
  botId?: string;
  blockId?: string;
  actionParams: Record<string, unknown>;
  clientExtra: Record<string, unknown>;
};

export type KakaoQuickReply = {
  label: string;
  messageText: string;
};

export type KakaoSkillResponse = {
  version: "2.0";
  useCallback?: boolean;
  template?: {
    outputs: Array<
      | { simpleText: { text: string } }
      | {
          basicCard: {
            title: string;
            description: string;
            buttons: Array<{
              action: "webLink";
              label: string;
              webLinkUrl: string;
            }>;
          };
        }
    >;
    quickReplies?: Array<{
      action: "message";
      label: string;
      messageText: string;
    }>;
  };
  data?: Record<string, unknown>;
};
