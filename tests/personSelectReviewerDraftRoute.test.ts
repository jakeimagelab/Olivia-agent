import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let adminSession = true;
let draftRow: Record<string, unknown> | null = null;

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => adminSession }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: draftRow, error: null }),
      };
      return chain;
    },
  }),
}));

import { GET } from "@/app/api/person-select/[eventId]/reviewers/[reviewerId]/draft/route";

const context = { params: Promise.resolve({ eventId: "event-1", reviewerId: "reviewer-1" }) };

describe("person select reviewer draft refresh", () => {
  beforeEach(() => {
    adminSession = true;
    draftRow = null;
  });

  it("requires an admin session", async () => {
    adminSession = false;
    const response = await GET(new NextRequest("http://localhost/api/person-select/event-1/reviewers/reviewer-1/draft"), context);
    expect(response.status).toBe(401);
  });

  it("returns only the selected reviewer's lightweight snapshot", async () => {
    draftRow = {
      revision: 8,
      items: [
        { image_id: "image-a", customer_rating: 5, customer_color_label: null, memo: "확인" },
        { image_id: "image-b", customer_rating: null, customer_color_label: 6, memo: "" },
      ],
      customer_memo: "",
      updated_at: "2026-11-12T10:00:00.000Z",
    };
    const response = await GET(new NextRequest("http://localhost/api/person-select/event-1/reviewers/reviewer-1/draft"), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.draft).toMatchObject({
      revision: 8,
      selectedImageIds: ["image-a", "image-b"],
      ratings: { "image-a": 5 },
      colorLabels: { "image-b": 6 },
      imageNotes: { "image-a": "확인" },
    });
  });
});
