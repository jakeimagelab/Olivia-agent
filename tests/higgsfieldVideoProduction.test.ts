import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { MODELS } from "@/lib/higgsfield/vendor/template/catalog";
import { defaultSettings } from "@/components/video-production/types";
import { upsertVideoGenerationHistory } from "@/lib/higgsfield/history";
import type { VideoGenerationRecord, VideoModelCapability } from "@/lib/higgsfield/types";
import { HIGGSFIELD_POLL_DEADLINE_MS, shouldRestoreVideoGenerationWatch, videoGenerationPollDeadline } from "@/lib/higgsfield/recovery";
import { getVideoGenerationStatuses } from "@/lib/higgsfield/adapter";
import { PlatformError } from "@/lib/higgsfield/vendor/template/platform";
import { getGenerationStatuses } from "@/lib/higgsfield/vendor/template/actions";

function capability(model: typeof MODELS[number]): VideoModelCapability {
  return {
    id: model.id,
    label: model.label,
    surface: model.surface,
    roles: model.roles,
    mediaModes: model.mediaModes,
    requiredRoles: model.requiredRoles,
    requirePrompt: model.requirePrompt,
    settings: model.settings,
    icon: model.icon,
  };
}

function record(requestId: string, updatedAt: string): VideoGenerationRecord {
  return {
    requestId,
    model: "seedance-2.5",
    modelLabel: "Seedance 2.5",
    prompt: "slow camera movement",
    settings: {},
    status: "queued",
    createdAt: updatedAt,
    updatedAt,
  };
}

describe("Higgsfield video production integration", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("derives selectable video models and their settings from the official catalog", () => {
    const videoModels = MODELS.filter((model) => model.surface === "video");
    expect(videoModels.length).toBeGreaterThan(0);
    const seedance = videoModels.find((model) => model.id === "seedance-2.5");
    expect(seedance).toBeDefined();
    expect(defaultSettings(capability(seedance!))).toMatchObject({ aspectRatio: "16:9", duration: 5 });
  });

  it("accepts the complete Open Higgsfield API key only on the server", () => {
    const config = readFileSync("lib/higgsfield/config.ts", "utf8");

    expect(config).toContain('import "server-only"');
    expect(config).toContain("process.env.HF_API_KEY");
    expect(config).toContain("process.env.HIGGSFIELD_API_KEY");
    expect(config).toContain("HF_API_SECRET");
    expect(config).not.toContain("credentials.split");
    expect(config).not.toContain("NEXT_PUBLIC_HIGGSFIELD");
  });

  it("does not misrepresent an unknown provider status as an endless queued request", () => {
    const normalize = readFileSync("lib/higgsfield/normalize.ts", "utf8");

    expect(normalize).toContain("fallback: VideoGenerationStatus = \"queued\"");
    expect(normalize).toContain("return fallback;");
    expect(normalize).not.toContain('default:\n      return "queued";');
  });

  it("keeps generation history idempotent while placing the newest status first", () => {
    const older = record("req-older", "2026-10-01T00:00:00.000Z");
    const newer = { ...record("req-newer", "2026-10-01T01:00:00.000Z"), status: "completed" as const };
    const updatedOlder = { ...older, status: "in_progress" as const, updatedAt: "2026-10-01T02:00:00.000Z" };

    const first = upsertVideoGenerationHistory([], older);
    const second = upsertVideoGenerationHistory(first, newer);
    const final = upsertVideoGenerationHistory(second, updatedOlder);

    expect(final.map((item) => item.requestId)).toEqual(["req-older", "req-newer"]);
    expect(final).toHaveLength(2);
    expect(final[0]?.status).toBe("in_progress");
  });

  it("uses the official upload and polling core through Olivia's server routes", () => {
    const upload = readFileSync("lib/higgsfield/vendor/template/upload.ts", "utf8");
    const uploadRoute = readFileSync("app/api/higgsfield/upload/route.ts", "utf8");
    const poll = readFileSync("lib/higgsfield/vendor/template/poll.ts", "utf8");
    const adapter = readFileSync("lib/higgsfield/adapter.ts", "utf8");

    expect(upload).toContain('fetch("/api/higgsfield/upload"');
    expect(uploadRoute).toContain("NextResponse.json(ticket");
    expect(uploadRoute).not.toContain("{ ok: true, ticket }");
    expect(poll).toContain("POLL_INTERVAL_MS = 4000");
    expect(adapter).toContain("createOfficialPlatformClient().submit(path, body)");
  });

  it("opens inside the native video studio window instead of a standalone app", () => {
    const registry = readFileSync("components/olivia-os/registry/oliviaAppRegistry.ts", "utf8");
    const studio = readFileSync("components/video-studio/VideoStudio.tsx", "utf8");

    expect(registry).not.toContain('id: "video-production"');
    expect(registry).toContain('\"video-production\": \"video-studio\"');
    expect(studio).toContain("<VideoProductionWorkspace embedded />");
    expect(studio).not.toContain("LegacyRouteWindowContent");
  });

  it("keeps focused video settings readable in the dark production panel", () => {
    const css = readFileSync("components/video-production/VideoProductionWorkspace.module.css", "utf8");

    expect(css).toContain(".settingsPanel .select:focus");
    expect(css).toContain("background: #274542");
    expect(css).toContain("color: #ffffff");
    expect(css).toContain("caret-color: #ffffff");
    expect(css).toContain("color: #a8cbc4");
  });

  it("makes long Higgsfield queues visible and keeps cancellation available", () => {
    const workspace = readFileSync("components/video-production/VideoProductionWorkspace.tsx", "utf8");
    const viewer = readFileSync("components/video-production/VideoResultViewer.tsx", "utf8");

    expect(readFileSync("lib/higgsfield/recovery.ts", "utf8")).toContain("HIGGSFIELD_POLL_DEADLINE_MS = 10 * 60_000");
    expect(workspace).toContain("HIGGSFIELD_QUEUE_TIMEOUT_MESSAGE");
    expect(workspace).toContain('"queue_timeout"');
    expect(viewer).toContain("Higgsfield 대기열 지연");
    expect(viewer).toContain("Higgsfield 대기열 확인 한도 초과");
    expect(viewer).toContain("최근 상태 확인");
    expect(viewer).toContain("기존 요청 취소");
    expect(viewer).toContain("상태 다시 확인");
  });

  it("starts a fresh ten-minute deadline when a six-minute-old record is restored", () => {
    const now = Date.parse("2026-10-16T10:00:00.000Z");
    const restored = record("req-restored", new Date(now - 6 * 60_000).toISOString());
    restored.status = "in_progress";
    expect(shouldRestoreVideoGenerationWatch(restored, now)).toBe(true);
    expect(videoGenerationPollDeadline(now)).toBe(now + HIGGSFIELD_POLL_DEADLINE_MS);
  });

  it("restores recent queue timeouts but excludes ones older than 24 hours", () => {
    const now = Date.parse("2026-10-16T10:00:00.000Z");
    const recent = { ...record("recent", new Date(now - 60_000).toISOString()), status: "queue_timeout" as const };
    const expired = { ...record("expired", new Date(now - 24 * 60 * 60_000 - 1).toISOString()), status: "queue_timeout" as const };
    expect(shouldRestoreVideoGenerationWatch(recent, now)).toBe(true);
    expect(shouldRestoreVideoGenerationWatch(expired, now)).toBe(false);
  });

  it("keeps transient status errors retryable and marks only missing requests failed", async () => {
    const transient = await getVideoGenerationStatuses(["transient"], { status: vi.fn().mockRejectedValue(new Error("rate limited")) });
    expect(transient).toEqual([{ requestId: "transient", checkError: "rate limited" }]);
    const missing = await getVideoGenerationStatuses(["missing"], { status: vi.fn().mockRejectedValue(new PlatformError(404, { detail: "not found" })) });
    expect(missing).toEqual([{ requestId: "missing", status: "failed", providerError: "not found" }]);
  });

  it("drops transient checkError entries from the client poll result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, statuses: [{ requestId: "retry", checkError: "temporary" }] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(getGenerationStatuses({ requestIds: ["retry"] })).resolves.toEqual([]);
  });
});
