import { describe, expect, it } from "vitest";
import {
  decryptAssistantSecret,
  encryptAssistantSecret,
  hashAssistantSecret,
  safeHashEquals,
} from "@/lib/assistant/security";

describe("assistant secret security", () => {
  const key = Buffer.alloc(32, 7);
  const pepper = "test-pepper-that-is-long-enough";

  it("채널 식별자를 AES-GCM으로 암복호화한다", () => {
    const encrypted = encryptAssistantSecret("kakao-user-123", key);
    expect(encrypted).not.toContain("kakao-user-123");
    expect(decryptAssistantSecret(encrypted, key)).toBe("kakao-user-123");
  });

  it("같은 값은 같은 lookup hash를 만든다", () => {
    const first = hashAssistantSecret("kakao-user-123", pepper);
    const second = hashAssistantSecret("kakao-user-123", pepper);
    expect(safeHashEquals(first, second)).toBe(true);
  });

  it("잘못된 키로 복호화할 수 없다", () => {
    const encrypted = encryptAssistantSecret("secret", key);
    expect(() =>
      decryptAssistantSecret(encrypted, Buffer.alloc(32, 8)),
    ).toThrow();
  });
});
