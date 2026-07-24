export const ASSISTANT_CHANNELS = ["web", "telegram", "kakao", "voice"] as const;
export type AssistantChannel = (typeof ASSISTANT_CHANNELS)[number];

export const ASSISTANT_ROLES = ["OWNER", "ADMIN", "STAFF", "READ_ONLY"] as const;
export type AssistantRole = (typeof ASSISTANT_ROLES)[number];

export const ASSISTANT_ACTION_STATUSES = [
  "queued",
  "processing",
  "waiting_confirmation",
  "approved",
  "completed",
  "failed",
  "cancelled",
  "expired",
] as const;
export type AssistantActionStatus = (typeof ASSISTANT_ACTION_STATUSES)[number];

export const ASSISTANT_CONFIRMATION_STATUSES = [
  "waiting",
  "confirmed",
  "cancelled",
  "expired",
] as const;
export type AssistantConfirmationStatus = (typeof ASSISTANT_CONFIRMATION_STATUSES)[number];

export const ASSISTANT_NOTIFICATION_PRIORITIES = [
  "CRITICAL",
  "HIGH",
  "NORMAL",
  "LOW",
] as const;
export type AssistantNotificationPriority =
  (typeof ASSISTANT_NOTIFICATION_PRIORITIES)[number];

export type AssistantMessageRole = "user" | "assistant" | "system";

export type AssistantAttachment = {
  id?: string;
  kind: "image" | "document" | "audio";
  name: string;
  mimeType: string;
  sizeBytes?: number;
  storagePath?: string;
  remoteUrl?: string;
};

export type AssistantIncomingMessage = {
  requestId: string;
  externalMessageId?: string;
  conversationId?: string;
  ownerId: string;
  channel: AssistantChannel;
  content: string;
  attachments?: AssistantAttachment[];
  parentMessageId?: string;
  callbackUrl?: string;
  receivedAt: string;
};

export type AssistantActionRequestInput = {
  ownerId: string;
  conversationId?: string;
  messageId?: string;
  sourceChannel: AssistantChannel;
  actionName: string;
  parameters: Record<string, unknown>;
  permissionLevel: AssistantRole;
  confirmationRequired: boolean;
  idempotencyKey: string;
};

export type AssistantActionContext = {
  ownerId: string;
  role: AssistantRole;
  channel: AssistantChannel;
  conversationId?: string;
  messageId?: string;
  requestId: string;
};

export type AssistantActionResult = {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  actionHref?: string;
};

export type AssistantPublicError = {
  code: string;
  message: string;
  retryable: boolean;
};
