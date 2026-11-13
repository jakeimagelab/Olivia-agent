import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadPersonSelectDeliveries,
  loadPersonSelectDeliveryDownloadUrls,
  submitPersonSelectDeliveries,
  updatePersonSelectDelivery,
} from "@/components/person-select/personSelectDeliveryClient";
import { personSelectDeliveryStatusLabel } from "@/components/person-select/personSelectDeliveryTypes";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("person select delivery client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the delivery endpoint contracts", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("download-urls")) return jsonResponse({ ok: true, files: [] });
      if (url.endsWith("/submit")) return jsonResponse({ ok: true });
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      return jsonResponse({
        ok: true,
        event: { title: "프로필", retentionDays: 30 },
        viewer: { displayName: "고객", canFinalize: true },
        access: {
          state: "reviewing",
          approvedAt: null,
          downloadedAt: null,
          expiresAt: null,
          expired: false,
          downloadAvailable: false,
        },
        items: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPersonSelectDeliveries("/api/pick/example")).resolves.toMatchObject({ ok: true, items: [] });
    await updatePersonSelectDelivery({
      apiBase: "/api/pick/example",
      deliveryId: "delivery-1",
      action: "request_revision",
      memo: "조금 밝게",
    });
    await submitPersonSelectDeliveries("/api/pick/example", "finalize");
    await expect(loadPersonSelectDeliveryDownloadUrls("/api/pick/example")).resolves.toEqual({ ok: true, files: [] });

    expect(fetchMock).toHaveBeenCalledWith("/api/pick/example/deliveries/delivery-1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "request_revision", memo: "조금 밝게" }),
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/pick/example/deliveries/submit", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ action: "finalize" }),
    }));
  });

  it("preserves API error messages", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "최종 확인 전입니다." }, 403)));
    await expect(loadPersonSelectDeliveryDownloadUrls("/api/pick/example"))
      .rejects.toThrow("최종 확인 전입니다.");
  });

  it("keeps the existing Korean review labels", () => {
    expect(personSelectDeliveryStatusLabel("pending")).toBe("확인 전");
    expect(personSelectDeliveryStatusLabel("revision_requested")).toBe("수정 요청");
    expect(personSelectDeliveryStatusLabel("revised")).toBe("수정됨");
    expect(personSelectDeliveryStatusLabel("approved")).toBe("확인");
  });
});
