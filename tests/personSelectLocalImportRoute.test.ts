import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/passkey", () => ({ isAdminSession: () => false }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));

import { POST, PUT } from "@/app/api/person-select/[eventId]/local-import/route";

const context = { params: Promise.resolve({ eventId: "event-1" }) };

describe("person select local import API", () => {
  it("requires an admin session for manifest preparation and image upload", async () => {
    const prepare = await PUT(new NextRequest("http://localhost/api/person-select/event-1/local-import", { method: "PUT" }), context);
    const upload = await POST(new NextRequest("http://localhost/api/person-select/event-1/local-import", { method: "POST" }), context);
    expect(prepare.status).toBe(401);
    expect(upload.status).toBe(401);
  });
});
