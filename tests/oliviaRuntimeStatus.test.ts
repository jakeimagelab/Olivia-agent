import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveOliviaRuntimeStatusPollDelay,
} from "@/components/olivia-os/OliviaRuntimeStatusProvider";
import type { StatusPanelData } from "@/lib/system-status/panelTypes";

function statusWithRemoteJob(status: "QUEUED" | "RUNNING" | "COMPLETED"): StatusPanelData {
  return {
    ok: true,
    checkedAt: "2026-11-15T00:00:00.000Z",
    diagnostics: {
      ok: true,
      checkedAt: "2026-11-15T00:00:00.000Z",
      issueCount: 0,
      summary: "정상",
      items: [],
    },
    panelIssues: [],
    myTurn: [],
    recentActivity: [],
    progress: [{
      id: "remote-job",
      kind: "remote_job_progress",
      level: "info",
      title: "사진 작업",
      remoteJob: {
        id: "job-1",
        status,
        message: null,
        error: null,
        progress: null,
      },
    }],
  };
}

describe("Olivia OS shared runtime status", () => {
  it("polls active work quickly and reduces polling for idle or hidden tabs", () => {
    expect(resolveOliviaRuntimeStatusPollDelay(statusWithRemoteJob("RUNNING"), "visible")).toBe(5_000);
    expect(resolveOliviaRuntimeStatusPollDelay(statusWithRemoteJob("COMPLETED"), "visible")).toBe(30_000);
    expect(resolveOliviaRuntimeStatusPollDelay(statusWithRemoteJob("RUNNING"), "hidden")).toBe(60_000);
  });

  it("keeps status fetching in one provider instead of each desktop consumer", () => {
    const provider = readFileSync("components/olivia-os/OliviaRuntimeStatusProvider.tsx", "utf8");
    const desktop = readFileSync("components/olivia-os/OliviaDesktop.tsx", "utf8");
    const topBar = readFileSync("components/olivia-os/DesktopTopBar.tsx", "utf8");
    const widgets = readFileSync("components/olivia-os/DesktopWidgets.tsx", "utf8");
    const caseChrome = readFileSync("components/olivia-os/DesktopCaseChrome.tsx", "utf8");
    const panel = readFileSync("components/olivia-os/StatusPanelButton.tsx", "utf8");

    expect(provider).toContain("loadStatusPanelData");
    expect(provider).toContain('document.addEventListener("visibilitychange"');
    expect(desktop).toContain("<OliviaRuntimeStatusProvider>");
    expect(topBar).not.toContain("loadRemoteWorkerStatus");
    expect(topBar).not.toContain("setInterval");
    expect(widgets).not.toContain("loadStatusPanelData");
    expect(caseChrome).not.toContain("loadStatusPanelData");
    expect(panel).not.toContain("loadStatusPanelData");
    expect(panel).not.toContain("setInterval");
  });
});
