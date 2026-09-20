import { SYSTEM_STATUS_GROUP_LABELS } from "./messages";
import type { SystemStatusItem, SystemStatusReport } from "./types";

const GROUP_ORDER = ["cloud", "mac_studio", "database"] as const;
const LEVEL_ORDER: Record<SystemStatusItem["level"], number> = { error: 0, unknown: 1, warning: 2, ok: 3 };
const LEVEL_ICON: Record<SystemStatusItem["level"], string> = { error: "🔴", unknown: "⚪", warning: "🟠", ok: "🟢" };

export function formatSystemStatusForChat(report: SystemStatusReport): string {
  const lines = [
    report.issueCount === 0 ? "시스템 상태: 정상" : `시스템 상태: ${report.issueCount}개 항목 확인 필요`,
    report.summary,
  ];

  for (const group of GROUP_ORDER) {
    const items = report.items
      .filter((item) => item.group === group)
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
    if (!items.length) continue;
    lines.push("", `[${SYSTEM_STATUS_GROUP_LABELS[group]}]`);
    for (const item of items) {
      lines.push(`${LEVEL_ICON[item.level]} ${item.label} · ${item.state}${item.detail ? ` — ${item.detail}` : ""}`);
      if (item.level !== "ok" && item.remedy) lines.push(`조치: ${item.remedy}`);
    }
  }

  lines.push("", `점검 시각: ${new Date(report.checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}`);
  return lines.join("\n");
}
