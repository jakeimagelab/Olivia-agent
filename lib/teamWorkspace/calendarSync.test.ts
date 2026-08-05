import { describe, expect, it } from "vitest";
import { syncCalendarProjects } from "./calendarSync";

function makeFakeDb({ calendarRows, linkedRows }: { calendarRows: any[]; linkedRows: any[] }) {
  const inserted: any[] = [];
  const updated: { id: string; title: string }[] = [];
  let teamTasksSelectCalled = false;

  const db: any = {
    from(table: string) {
      if (table === "calendar_tasks") {
        const builder: any = {
          select: () => builder,
          in: () => builder,
          gte: () => builder,
          then: (resolve: any) => resolve({ data: calendarRows }),
        };
        return builder;
      }
      if (table === "team_tasks") {
        return {
          select: () => {
            teamTasksSelectCalled = true;
            const builder: any = {
              in: () => builder,
              then: (resolve: any) => resolve({ data: linkedRows }),
            };
            return builder;
          },
          insert: (rows: any[]) => {
            inserted.push(...rows);
            return Promise.resolve({ data: rows, error: null });
          },
          update: (patch: any) => ({
            eq: (_col: string, id: string) => {
              updated.push({ id, title: patch.title });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db, inserted, updated, wasTeamTasksQueried: () => teamTasksSelectCalled };
}

describe("syncCalendarProjects", () => {
  it("아직 연동되지 않은 캘린더 항목을 워크스페이스 할일로 생성한다", async () => {
    const { db, inserted } = makeFakeDb({
      calendarRows: [{ id: "cal-1", title: "미소로한의원 영상편집", date: "2026-08-12", time: "14:00", location: "스튜디오", category: "client" }],
      linkedRows: [],
    });
    await syncCalendarProjects(db, "actor-1");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      title: "미소로한의원 영상편집",
      calendar_task_id: "cal-1",
      created_by: "actor-1",
      status: "todo",
    });
    expect(inserted[0].description).toContain("2026-08-12");
  });

  it("이미 연동된 캘린더 항목은 다시 생성하지 않는다", async () => {
    const { db, inserted } = makeFakeDb({
      calendarRows: [{ id: "cal-1", title: "미소로한의원 영상편집", date: "2026-08-12", time: null, location: null, category: "client" }],
      linkedRows: [{ id: "task-1", calendar_task_id: "cal-1", title: "미소로한의원 영상편집" }],
    });
    await syncCalendarProjects(db, "actor-1");
    expect(inserted).toHaveLength(0);
  });

  it("연동된 항목의 캘린더 제목이 바뀌면 워크스페이스 할일 제목도 갱신한다", async () => {
    const { db, updated } = makeFakeDb({
      calendarRows: [{ id: "cal-1", title: "새 제목으로 변경됨", date: "2026-08-12", time: null, location: null, category: "shooting" }],
      linkedRows: [{ id: "task-1", calendar_task_id: "cal-1", title: "예전 제목" }],
    });
    await syncCalendarProjects(db, "actor-1");
    expect(updated).toEqual([{ id: "task-1", title: "새 제목으로 변경됨" }]);
  });

  it("제목이 같으면 갱신하지 않는다", async () => {
    const { db, updated } = makeFakeDb({
      calendarRows: [{ id: "cal-1", title: "동일 제목", date: "2026-08-12", time: null, location: null, category: "shooting" }],
      linkedRows: [{ id: "task-1", calendar_task_id: "cal-1", title: "동일 제목" }],
    });
    await syncCalendarProjects(db, "actor-1");
    expect(updated).toHaveLength(0);
  });

  it("동기화 대상 캘린더 항목이 없으면 team_tasks를 조회하지 않는다", async () => {
    const { db, wasTeamTasksQueried } = makeFakeDb({ calendarRows: [], linkedRows: [] });
    await syncCalendarProjects(db, "actor-1");
    expect(wasTeamTasksQueried()).toBe(false);
  });
});
