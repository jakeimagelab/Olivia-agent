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
    const poll = readFileSync("lib/higgsfield/vendor/template/poll.ts", "utf8");
    const adapter = readFileSync("lib/higgsfield/adapter.ts", "utf8");

    expect(upload).toContain('fetch("/api/higgsfield/upload"');
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
});
