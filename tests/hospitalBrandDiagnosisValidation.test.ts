import { describe, expect, it } from "vitest";
import { escapeList, escapeText, isPlausibleHttpUrl, isUuid, isValidChannel } from "@/lib/hospitalBrandDiagnosis/validation";

describe("hospital brand diagnosis input validation", () => {
  it("accepts only well-formed UUIDs", () => {
    expect(isUuid("3fa85f64-5717-4562-b3fc-2c963f66afa6")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });

  it("only allows known channel enum values", () => {
    expect(isValidChannel("website")).toBe(true);
    expect(isValidChannel("naver_place")).toBe(true);
    expect(isValidChannel("tiktok")).toBe(false);
    expect(isValidChannel(123)).toBe(false);
  });

  it("escapes HTML-significant characters and trims/truncates", () => {
    expect(escapeText("<script>alert(1)</script>", 400)).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeText("  spaced  ", 400)).toBe("spaced");
    expect(escapeText("x".repeat(10), 3)).toBe("xxx");
  });

  it("dedupes and caps list length in escapeList", () => {
    expect(escapeList(["a", "a", "b"], 5)).toEqual(["a", "b"]);
    expect(escapeList(Array.from({ length: 30 }, (_, i) => `item${i}`), 5)).toHaveLength(5);
    expect(escapeList("not-an-array")).toEqual([]);
  });

  it("only accepts plausible http/https URLs", () => {
    expect(isPlausibleHttpUrl("https://hospital.example.com")).toBe(true);
    expect(isPlausibleHttpUrl("http://hospital.example.com/path")).toBe(true);
    expect(isPlausibleHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isPlausibleHttpUrl("data:text/html,<script>1</script>")).toBe(false);
    expect(isPlausibleHttpUrl("ftp://example.com")).toBe(false);
    expect(isPlausibleHttpUrl("not a url")).toBe(false);
  });
});
