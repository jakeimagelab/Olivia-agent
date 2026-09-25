import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const registerGallery = vi.hoisted(() => vi.fn());
const logPortalEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/clientPortal", () => ({ logPortalEvent }));
vi.mock("@/lib/clientGalleryLinking", () => ({ linkUnassignedPhotoGalleries: vi.fn() }));
vi.mock("@/lib/core/commands/workflow", () => ({ registerGallery }));

import { POST } from "@/app/api/galleries/route";

function req(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/galleries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// PHASE 3 작업 2(2026-09-25) — 단계 전진 실패를 console.error로만 삼키던 걸 없앴다. 갤러리
// 등록 자체는 여전히 성공(ok:true)이고, 전진 실패 사유는 advance 필드로 응답에 실린다.
describe("POST /api/galleries — 전진 실패를 조용히 삼키지 않는다", () => {
  it("returns ok:true with the block reason when the workflow advance is blocked", async () => {
    registerGallery.mockResolvedValue({
      ok: true,
      value: {
        gallery: { id: "gallery-1", hospital_name: "포토클리닉" },
        advance: { advanced: false, targetStep: "retouching", reason: "open_items" },
      },
    });

    const res = await POST(req({
      hospitalName: "포토클리닉",
      nasLink: "https://nas.example.com/photo.jpg",
      galleryType: "final_photo",
      client_id: "client-1",
      workflow_run_id: "run-1",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      gallery: { id: "gallery-1" },
      advance: { advanced: false, targetStep: "retouching", reason: "open_items" },
    });
    expect(logPortalEvent).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1", targetId: "gallery-1" }));
  });

  it("returns a real 500 (not a silent ok:true) when registerGallery itself fails", async () => {
    registerGallery.mockResolvedValue({ ok: false, reason: "갤러리를 저장하지 못했습니다." });

    const res = await POST(req({
      hospitalName: "포토클리닉",
      nasLink: "https://nas.example.com/photo.jpg",
      galleryType: "final_photo",
    }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({ ok: false, error: "갤러리를 저장하지 못했습니다." });
  });
});
