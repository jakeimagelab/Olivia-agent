export const OLIVIA_CONVERSATION_POLL_INTERVAL_MS = 60_000;
export const PROJECT_MESSAGE_POLL_INTERVAL_MS = 30_000;

export function shouldRunVisiblePoll(input: {
  enabled: boolean;
  surfaceVisible: boolean;
  documentVisibility: DocumentVisibilityState;
}) {
  return input.enabled && input.surfaceVisible && input.documentVisibility === "visible";
}
