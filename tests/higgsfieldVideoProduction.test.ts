import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/higgsfield/vendor/template/catalog";
import { defaultSettings } from "@/components/video-production/types";
import { upsertVideoGenerationHistory } from "@/lib/higgsfield/history";
import type { VideoGenerationRecord, VideoModelCapability } from "@/lib/higgsfield/types";

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

  it("opens as a native Olivia OS window instead of a legacy iframe", () => {
    const registry = readFileSync("components/olivia-os/registry/oliviaAppRegistry.ts", "utf8");
    const adapter = readFileSync("components/olivia-os/adapters/VideoProductionWindowContent.tsx", "utf8");

    expect(registry).toContain('id: "video-production"');
    expect(registry).toContain("component: VideoProductionWindowContent");
    expect(adapter).toContain("VideoProductionWorkspace embedded");
    expect(adapter).not.toContain("LegacyRouteWindowContent");
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

    expect(workspace).toContain("HIGGSFIELD_POLL_DEADLINE_MS = 5 * 60_000");
    expect(workspace).toContain("HIGGSFIELD_QUEUE_TIMEOUT_MESSAGE");
    expect(workspace).toContain('"queue_timeout"');
    expect(viewer).toContain("Higgsfield 대기열 지연");
    expect(viewer).toContain("Higgsfield 대기열 확인 한도 초과");
    expect(viewer).toContain("최근 상태 확인");
    expect(viewer).toContain("기존 요청 취소");
  });
});
