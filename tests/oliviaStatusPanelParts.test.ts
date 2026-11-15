import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeStatusTime } from "@/components/olivia-os/StatusPanelParts";

describe("Olivia OS status panel modules", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps relative status timestamps unchanged after extracting the view components", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00.000Z"));

    expect(relativeStatusTime(null)).toBe("시각 확인 불가");
    expect(relativeStatusTime("2026-11-15T12:00:00.000Z")).toBe("방금");
    expect(relativeStatusTime("2026-11-15T11:30:00.000Z")).toBe("30분 전");
    expect(relativeStatusTime("2026-11-15T10:00:00.000Z")).toBe("2시간 전");
    expect(relativeStatusTime("2026-11-13T12:00:00.000Z")).toBe("2일 전");
  });

  it("separates display components from the status orchestration module", () => {
    const controller = readFileSync("components/olivia-os/StatusPanelButton.tsx", "utf8");
    const parts = readFileSync("components/olivia-os/StatusPanelParts.tsx", "utf8");

    expect(controller).toContain('from "./StatusPanelParts"');
    expect(controller).not.toContain("class StatusPanelErrorBoundary");
    expect(controller).not.toContain("function StatusPanelEntryRow");
    expect(parts).toContain("export class StatusPanelErrorBoundary");
    expect(parts).toContain("export function StatusPanelEntryRow");
    expect(parts).toContain("export function CompactedStatusPanelEntryList");
  });
});
