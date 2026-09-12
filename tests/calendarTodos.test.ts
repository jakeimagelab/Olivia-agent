import { describe, expect, it } from "vitest";
import { normalizeCalendarTodoTitle, rowToCalendarTodo } from "@/lib/calendarTodos";

describe("calendar todos", () => {
  it("normalizes valid titles", () => {
    expect(normalizeCalendarTodoTitle("  견적 확인  ")).toEqual({ ok: true, title: "견적 확인" });
  });

  it("rejects empty and oversized titles", () => {
    expect(normalizeCalendarTodoTitle("   ").ok).toBe(false);
    expect(normalizeCalendarTodoTitle("가".repeat(161)).ok).toBe(false);
  });

  it("serializes database rows", () => {
    expect(rowToCalendarTodo({ id: "todo-1", title: "확인", completed: true, sort_order: 2, created_at: "a", updated_at: "b" }))
      .toEqual({ id: "todo-1", title: "확인", completed: true, sortOrder: 2, createdAt: "a", updatedAt: "b" });
  });
});
