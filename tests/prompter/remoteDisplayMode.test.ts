import { describe, expect, it } from "vitest";
import { recommendRemoteDisplayMode } from "@/lib/prompter/remoteDisplayMode";

describe("recommendRemoteDisplayMode", () => {
  it("keeps phones in remote mode", () => {
    expect(recommendRemoteDisplayMode({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
      maxTouchPoints: 5,
      screenWidth: 430,
      screenHeight: 932,
    })).toBe("remote");
  });

  it("recognizes iPad desktop browsing mode as mirror mode", () => {
    expect(recommendRemoteDisplayMode({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
      screenWidth: 820,
      screenHeight: 1180,
    })).toBe("mirror");
  });

  it("recognizes Android tablets as mirror mode", () => {
    expect(recommendRemoteDisplayMode({
      userAgent: "Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36",
      maxTouchPoints: 10,
      screenWidth: 900,
      screenHeight: 1440,
    })).toBe("mirror");
  });
});
