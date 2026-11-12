import { describe, expect, it } from "vitest";
import {
  parsePersonSelectOfferOptions,
  parsePersonSelectOfferPrice,
  personSelectOfferOptionsToText,
} from "@/components/person-select/admin/OfferSettings";

describe("person select offer settings", () => {
  it("parses won, comma, and man-won price formats", () => {
    expect(parsePersonSelectOfferPrice("30,000원")).toBe(30_000);
    expect(parsePersonSelectOfferPrice("3만")).toBe(30_000);
    expect(parsePersonSelectOfferPrice("2.5만")).toBe(25_000);
    expect(Number.isNaN(parsePersonSelectOfferPrice("협의"))).toBe(true);
  });

  it("keeps an existing option key while parsing edited text", () => {
    const previous = [{ key: "six-r", label: "6R", price: 30_000 }];
    const parsed = parsePersonSelectOfferOptions("6R = 50,000원\n앨범 = 10만", previous);

    expect(parsed[0]).toEqual({ key: "six-r", label: "6R", price: 50_000 });
    expect(parsed[1]).toMatchObject({ label: "앨범", price: 100_000 });
  });

  it("formats options for the admin textarea", () => {
    expect(personSelectOfferOptionsToText({ key: "frame", label: "액자", unit: "개", price: 0, note: "", needs_photo: true, options: [{ key: "six-r", label: "6R", price: 30_000 }] })).toBe("6R = 30000");
  });
});
