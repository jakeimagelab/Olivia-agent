import { describe, expect, it } from "vitest";
import { Calendar, Search } from "lucide-react";
import { filterAdminTools, normalizeAdminSearchQuery, sanitizePostgrestSearch } from "@/lib/adminSearch";
import type { ToolDef } from "@/lib/toolNav";

const tools: ToolDef[] = [
  { title: "업무 캘린더", desc: "촬영 일정을 관리합니다.", href: "/calendar", icon: Calendar, meta: "Task Calendar", orange: false, category: "dashboard" },
  { title: "AI 검색 최적화", desc: "사진 SEO 납품 자료를 만듭니다.", href: "/seo-delivery", icon: Search, meta: "SEO Delivery", orange: true, category: "tools" },
];

describe("admin header search", () => {
  it("normalizes case and repeated whitespace", () => {
    expect(normalizeAdminSearchQuery("  AI   Search  ")).toBe("ai search");
  });

  it("removes PostgREST filter control characters", () => {
    expect(sanitizePostgrestSearch("고객%,테스트_()" )).toBe("고객 테스트");
  });

  it("finds tools by Korean title, description, and English metadata", () => {
    expect(filterAdminTools(tools, "캘린더").map((item) => item.href)).toEqual(["/calendar"]);
    expect(filterAdminTools(tools, "seo").map((item) => item.href)).toEqual(["/seo-delivery"]);
    expect(filterAdminTools(tools, "촬영 일정").map((item) => item.href)).toEqual(["/calendar"]);
  });
});
