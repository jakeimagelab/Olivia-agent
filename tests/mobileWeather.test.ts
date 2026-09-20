import { describe, expect, it } from "vitest";
import { describeMobileWeather, mobileRegionLabel } from "@/lib/olivia/mobile/weather";

describe("mobile home weather", () => {
  it("maps WMO current-weather codes without hard-coded temperatures", () => {
    expect(describeMobileWeather(0, true)).toEqual({ label: "맑음", symbol: "☀️" });
    expect(describeMobileWeather(63)).toEqual({ label: "비", symbol: "🌧️" });
    expect(describeMobileWeather(95)).toEqual({ label: "뇌우", symbol: "⛈️" });
  });

  it("keeps only the city and district from Kakao region data", () => {
    expect(mobileRegionLabel({ documents: [{ region_type: "B", region_1depth_name: "서울특별시", region_2depth_name: "강남구" }, { region_type: "H", region_1depth_name: "서울특별시", region_2depth_name: "강남구" }] }))
      .toBe("서울특별시 강남구");
    expect(mobileRegionLabel({ documents: [] })).toBeNull();
  });
});
