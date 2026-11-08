import { describe, expect, it } from "vitest";
import { GET as retiredOliviaEvents } from "@/app/api/olivia/v2/conversation/events/route";
import { GET as retiredAdminProjectEvents } from "@/app/api/person-select/[eventId]/messages/events/route";
import { GET as retiredSharedProjectEvents } from "@/app/api/pick/shared/[shareToken]/messages/events/route";
import {
  OLIVIA_CONVERSATION_POLL_INTERVAL_MS,
  PROJECT_MESSAGE_POLL_INTERVAL_MS,
  shouldRunVisiblePoll,
} from "@/lib/client/visiblePolling";

describe("visibility-aware polling policy", () => {
  it("polls only when the feature and its visible surface are active", () => {
    expect(shouldRunVisiblePoll({ enabled: true, surfaceVisible: true, documentVisibility: "visible" })).toBe(true);
    expect(shouldRunVisiblePoll({ enabled: false, surfaceVisible: true, documentVisibility: "visible" })).toBe(false);
    expect(shouldRunVisiblePoll({ enabled: true, surfaceVisible: false, documentVisibility: "visible" })).toBe(false);
    expect(shouldRunVisiblePoll({ enabled: true, surfaceVisible: true, documentVisibility: "hidden" })).toBe(false);
  });

  it("uses conservative intervals for Olivia and project conversations", () => {
    expect(OLIVIA_CONVERSATION_POLL_INTERVAL_MS).toBe(60_000);
    expect(PROJECT_MESSAGE_POLL_INTERVAL_MS).toBe(30_000);
  });
});

describe("retired Vercel event streams", () => {
  it.each([
    ["Olivia", retiredOliviaEvents],
    ["admin project chat", retiredAdminProjectEvents],
    ["shared project chat", retiredSharedProjectEvents],
  ])("terminates the old %s EventSource without a reconnecting response body", async (_label, handler) => {
    const response = handler();
    expect(response.status).toBe(204);
    expect(response.headers.get("x-olivia-realtime")).toBe("visible-polling");
    expect(await response.text()).toBe("");
  });
});
