import type { ToolDef } from "@/lib/toolNav";

export type AdminSearchResult = {
  id: string;
  kind: "customer" | "project" | "tool";
  title: string;
  subtitle: string;
  href: string;
};

export function normalizeAdminSearchQuery(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ").slice(0, 80);
}

export function sanitizePostgrestSearch(value: unknown) {
  return normalizeAdminSearchQuery(value).replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

export function filterAdminTools(tools: ToolDef[], query: unknown): AdminSearchResult[] {
  const normalized = normalizeAdminSearchQuery(query);
  if (!normalized) return [];
  return tools.filter((tool) => normalizeAdminSearchQuery(`${tool.title} ${tool.desc} ${tool.meta}`).includes(normalized)).map((tool) => ({
    id: tool.href,
    kind: "tool",
    title: tool.title,
    subtitle: tool.desc,
    href: tool.href,
  }));
}
