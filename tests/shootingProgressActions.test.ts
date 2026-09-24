import { describe, expect, it } from "vitest";
import { normalizeExternalPhotoLink, registerOriginalDeliveryLink } from "@/lib/photo-storage/shootingProgressActions";

type Row = Record<string, any>;

function createDb(initial: Record<string, Row[]>) {
  const tables = Object.fromEntries(Object.entries(initial).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const from = (table: string) => {
    if (!tables[table]) tables[table] = [];
    const makeQuery = (operation: "select" | "insert" | "update", values?: Row) => {
      const filters: Array<(row: Row) => boolean> = [];
      const builder: any = {
        eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
        order() { return builder; },
        limit() { return builder; },
        select() { return builder; },
        async maybeSingle() {
          return { data: tables[table].filter((row) => filters.every((filter) => filter(row)))[0] ?? null, error: null };
        },
        async single() {
          if (operation === "insert") {
            const row = { id: `${table}-${tables[table].length + 1}`, ...values };
            tables[table].push(row);
            return { data: row, error: null };
          }
          const row = tables[table].find((candidate) => filters.every((filter) => filter(candidate)));
          if (!row) return { data: null, error: new Error("not found") };
          if (operation === "update") Object.assign(row, values);
          return { data: row, error: null };
        },
        then(resolve: (value: { data: Row[]; error: null }) => void) {
          if (operation === "insert") {
            const row = { id: `${table}-${tables[table].length + 1}`, ...values };
            tables[table].push(row);
          }
          resolve({ data: tables[table], error: null });
        },
      };
      return builder;
    };
    return {
      select: () => makeQuery("select"),
      insert: (row: Row) => makeQuery("insert", row),
      update: (row: Row) => makeQuery("update", row),
    };
  };
  return { tables, from };
}

describe("shooting progress actions", () => {
  it("accepts an external http(s) link", () => {
    expect(normalizeExternalPhotoLink("https://example.com/share/abc")).toBe("https://example.com/share/abc");
  });

  it("rejects empty, executable, and credential-bearing links", () => {
    expect(() => normalizeExternalPhotoLink(" ")).toThrow("유그린 링크");
    expect(() => normalizeExternalPhotoLink("javascript:alert(1)")).toThrow("http 또는 https");
    expect(() => normalizeExternalPhotoLink("https://user:secret@example.com/a")).toThrow("http 또는 https");
  });

  it("creates a linked selection gallery for a project without a workflow run", async () => {
    const db = createDb({
      photo_storage_projects: [{
        id: "project-1",
        project_name: "0911_WINF",
        source_relative_path: "0911_WINF",
        workflow_run_id: null,
        calendar_task_id: null,
        jpg_count: 1_375,
        discovered_at: "2026-09-11T01:00:00.000Z",
      }],
      select_galleries: [],
      photo_storage_events: [],
    });

    const result = await registerOriginalDeliveryLink(db as any, {
      projectId: "project-1",
      nasLink: "https://example.com/winf",
      baseUrl: "https://olivia.example",
    });

    expect(result).toMatchObject({ clientId: null, portalUrl: null });
    expect(result.selectionUrl).toMatch(/^https:\/\/olivia\.example\/select\//);
    expect(db.tables.select_galleries[0]).toMatchObject({
      photo_storage_project_id: "project-1",
      workflow_run_id: null,
      nas_link: "https://example.com/winf",
      status: "waiting_selection",
      total_jpg_count: 1_375,
    });
    expect(db.tables.photo_storage_events[0]).toMatchObject({
      project_id: "project-1",
      event_type: "PHOTO_WORKFLOW_STEP_CHANGED",
      payload: { stage: "original_delivery", state: "completed" },
    });
  });
});
