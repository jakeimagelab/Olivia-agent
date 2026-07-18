import { describe, expect, it } from "vitest";
import { assertSafeChannelUrl, normalizeChannelUrls } from "@/lib/channelAnalysis";

describe("channel analysis URL handling", () => {
  it("normalizes Instagram handles and missing schemes", () => {
    expect(normalizeChannelUrls({ insta: "@photoclinic_kr", web: "photoclinic.kr" })).toEqual({
      insta: "https://www.instagram.com/photoclinic_kr/",
      web: "https://photoclinic.kr",
      naver: "",
      blog: "",
    });
  });

  it("rejects local and private network targets", async () => {
    await expect(assertSafeChannelUrl("http://localhost:3000")).rejects.toThrow("내부 주소");
    await expect(assertSafeChannelUrl("http://127.0.0.1/private")).rejects.toThrow("사설 네트워크");
    await expect(assertSafeChannelUrl("http://192.168.0.2")).rejects.toThrow("사설 네트워크");
  });

  it("rejects non-http protocols", async () => {
    await expect(assertSafeChannelUrl("file:///etc/passwd")).rejects.toThrow("http/https");
  });
});
