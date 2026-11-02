import { describe, expect, it } from "vitest";
import { effectiveExtraMax, extraPickCount, findPickShortage, pickLimit, priceOrder, validateOffers, validateOrderItems } from "@/lib/person-select/core";
import { DEFAULT_PERSON_SELECT_OFFERS } from "@/lib/person-select/types";

const photo = { key: "photo", label: "사진", pick: 1 };

describe("추가 보정", () => {
  it("추가 보정 가격이 있을 때만 더 고를 수 있다", () => {
    expect(effectiveExtraMax({ extra_price: 0, extra_max: 5 })).toBe(0);
    expect(effectiveExtraMax({ extra_price: 50_000, extra_max: 5 })).toBe(5);
    expect(pickLimit(1, 5)).toBe(6);
  });

  it("기본 1장 + 추가 3장까지 제출을 받는다", () => {
    const base = { categories: [photo], groupLabel: null, imageCounts: { photo: 24 }, extraMax: 3 };
    expect(findPickShortage({ ...base, chosenCounts: { photo: 0 } })?.need).toBe(1);
    expect(findPickShortage({ ...base, chosenCounts: { photo: 4 } })).toBeNull();
    expect(findPickShortage({ ...base, chosenCounts: { photo: 5 } })).toEqual({ key: "photo", label: "사진", need: 4, have: 5 });
    expect(extraPickCount([photo], { photo: 4 })).toBe(3);
  });
});

describe("추가 주문 금액", () => {
  it("추가 보정과 액자·앨범을 합산한다", () => {
    const priced = priceOrder({
      offers: DEFAULT_PERSON_SELECT_OFFERS,
      items: [
        { offer_key: "frame", option_key: "16r", image_id: "img1", qty: 1 },
        { offer_key: "album", option_key: null, image_id: null, qty: 2 },
      ],
      extraCount: 2,
      extraPrice: 50_000,
      photoNames: { img1: "R5K_1024.JPG" },
    });
    expect(priced.lines.map((line) => [line.label, line.amount])).toEqual([["추가 보정", 100_000], ["액자 제작", 100_000], ["앨범 제작", 400_000]]);
    expect(priced.lines[1].detail).toBe("16R (16x20inch) · R5K_1024.JPG");
    expect(priced.total).toBe(600_000);
  });

  it("지워진 상품은 금액 없이 확인 필요로 남긴다", () => {
    const priced = priceOrder({ offers: [], items: [{ offer_key: "frame", option_key: "6r", image_id: null, qty: 1 }], extraCount: 0, extraPrice: 0 });
    expect(priced.total).toBe(0);
    expect(priced.lines[0].detail).toContain("확인 필요");
  });
});

describe("주문·상품 검사", () => {
  it("액자는 고른 사진 중 하나와 크기가 있어야 한다", () => {
    const chosen = new Set(["img1"]);
    expect(validateOrderItems([{ offer_key: "frame", option_key: "6r", image_id: "img1", qty: 2 }], DEFAULT_PERSON_SELECT_OFFERS, chosen)).toEqual({ items: [{ offer_key: "frame", option_key: "6r", image_id: "img1", qty: 2 }] });
    expect("error" in validateOrderItems([{ offer_key: "frame", option_key: "6r", image_id: "other", qty: 1 }], DEFAULT_PERSON_SELECT_OFFERS, chosen)).toBe(true);
    expect("error" in validateOrderItems([{ offer_key: "frame", option_key: "99r", image_id: "img1", qty: 1 }], DEFAULT_PERSON_SELECT_OFFERS, chosen)).toBe(true);
    expect("error" in validateOrderItems([{ offer_key: "album", option_key: null, image_id: null, qty: 0 }], DEFAULT_PERSON_SELECT_OFFERS, chosen)).toBe(true);
  });

  it("기본 상품 목록은 그대로 저장할 수 있고, 가격 없는 상품은 막는다", () => {
    expect(validateOffers(DEFAULT_PERSON_SELECT_OFFERS)).toBeNull();
    expect(validateOffers([{ key: "a", label: "앨범", unit: "권", price: 0, note: "", needs_photo: false, options: [] }])).toContain("가격");
    expect(validateOffers([{ key: "a", label: "액자", unit: "개", price: 0, note: "", needs_photo: true, options: [{ key: "x", label: "6R", price: -1 }] }])).toContain("가격");
  });
});
