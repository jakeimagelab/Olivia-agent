import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let adminSession = true;

const people = [
  { id: "person-1", display_name: "김춘자", group_label: "1반", pin_code: "1234", submitted_at: "2026-11-01T00:00:00.000Z", orders: [] },
  { id: "person-2", display_name: "이지영", group_label: null, pin_code: "5678", submitted_at: null, orders: [] },
];

const choices = [
  { person_id: "person-1", category_key: "photo", person_select_images: { original_file_name: "R5K_0001.JPG", source_rel_path: "김춘자/JPG원본/R5K_0001.JPG" } },
  { person_id: "person-2", category_key: "photo", person_select_images: { original_file_name: "R5K_0001.JPG", source_rel_path: "이지영/JPG원본/R5K_0001.JPG" } },
  { person_id: "person-2", category_key: "photo", person_select_images: null },
];

const db = {
  from(table: string) {
    if (table === "person_select_events") {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { title: "서공예", retouch_options: [], categories: [], offers: [], extra_price: 0 } }) }) }) };
    }
    if (table === "person_select_people") {
      return { select: () => ({ eq: () => ({ order: async () => ({ data: people }) }) }) };
    }
    if (table === "person_select_choices") {
      return { select: () => ({ eq: async () => ({ data: choices }) }) };
    }
    throw new Error(`unexpected table: ${table}`);
  },
};

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db }));

import { GET } from "@/app/api/person-select/[eventId]/exports/[kind]/route";

function request() {
  return new NextRequest("http://localhost/api/person-select/event-1/exports/selected");
}

beforeEach(() => { adminSession = true; });

describe("person select selected export", () => {
  it("returns unique file names and keeps one row per customer choice", async () => {
    const response = await GET(request(), { params: Promise.resolve({ eventId: "event-1", kind: "selected" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      eventTitle: "서공예",
      total: 2,
      fileNames: ["R5K_0001.JPG"],
      rows: [
        { fileName: "R5K_0001.JPG", relativePath: "김춘자/JPG원본/R5K_0001.JPG", personName: "김춘자", groupLabel: "1반", categoryKey: "photo" },
        { fileName: "R5K_0001.JPG", relativePath: "이지영/JPG원본/R5K_0001.JPG", personName: "이지영", groupLabel: "", categoryKey: "photo" },
      ],
    });
  });

  it("keeps the existing admin authentication guard", async () => {
    adminSession = false;
    const response = await GET(request(), { params: Promise.resolve({ eventId: "event-1", kind: "selected" }) });
    expect(response.status).toBe(401);
  });
});
