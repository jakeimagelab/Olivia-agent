"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import ScheduleColumn from "@/components/work-journal/ScheduleColumn";
import TodoColumn from "@/components/work-journal/TodoColumn";
import PreparationColumn from "@/components/work-journal/PreparationColumn";
import ScheduleDetailCard from "@/components/work-journal/ScheduleDetailCard";
import { C } from "@/lib/theme";
import { todayStr } from "@/lib/work-journal/dateLabel";
import type { CalendarEvent, UpcomingEntry } from "@/lib/work-journal/types";
import type { PrepEquipmentItem, ScheduleRental, ScheduleTodo } from "@/lib/work-journal/scheduleTypes";

// 서버가 500 등으로 죽으면 응답 본문이 JSON이 아닐 수 있다 — 항상 사람이 읽을 수 있는 메시지로 바꾼다.
async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`요청에 실패했습니다. (${response.status})`);
  }
  if (!data?.ok) throw new Error(data?.error || `요청에 실패했습니다. (${response.status})`);
  return data;
}

function rowToCalendarEvent(row: Record<string, any>): CalendarEvent {
  return {
    id: row.id,
    date: row.date,
    time: row.time ?? null,
    endTime: row.end_time ?? null,
    title: row.title ?? "",
    category: row.category ?? "general",
    completed: !!row.completed,
    location: row.location ?? null,
    memo: row.memo ?? "",
  };
}

function SpinBox() {
  return (
    <div style={{ padding: "80px 0", textAlign: "center", color: C.hint }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>불러오는 중...</div>
    </div>
  );
}

export default function WorkJournalPage() {
  return (
    <Suspense fallback={<SpinBox />}>
      <WorkJournalInner />
    </Suspense>
  );
}

function WorkJournalInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => searchParams.get("date") || todayStr());
  const [currentMonth, setCurrentMonth] = useState(() => (searchParams.get("date") || todayStr()).slice(0, 7));
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(() => searchParams.get("schedule"));

  const [dayCounts, setDayCounts] = useState<Map<string, { total: number; done: number }>>(new Map());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  const [schedulesForDate, setSchedulesForDate] = useState<CalendarEvent[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<CalendarEvent | null>(null);

  const [todos, setTodos] = useState<ScheduleTodo[]>([]);
  const [prepItems, setPrepItems] = useState<PrepEquipmentItem[]>([]);
  const [rentals, setRentals] = useState<ScheduleRental[]>([]);
  const [prepLoading, setPrepLoading] = useState(false);

  const [error, setError] = useState("");

  // date/schedule 두 URL 파라미터가 따로 레이스를 내지 않도록 한 곳에서만 router.replace를 호출한다.
  const syncUrl = useCallback((date: string, scheduleId: string | null) => {
    const qs = new URLSearchParams();
    qs.set("date", date);
    if (scheduleId) qs.set("schedule", scheduleId);
    router.replace(`/work-journal?${qs.toString()}`, { scroll: false });
  }, [router]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setCurrentMonth(date.slice(0, 7));
    setSelectedScheduleId(null);
    syncUrl(date, null);
  };

  const handleSelectSchedule = (id: string) => {
    setSelectedScheduleId(id);
    syncUrl(selectedDate, id);
  };

  const handleSelectUpcoming = (entry: UpcomingEntry) => {
    setSelectedDate(entry.date);
    setCurrentMonth(entry.date.slice(0, 7));
    setSelectedScheduleId(entry.id);
    syncUrl(entry.date, entry.id);
  };

  // 월 변경 → 미니 캘린더 점 표시(전체 카테고리 eventDates, 촬영 카테고리만 dayCounts) + 다가오는 일정.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson(`/api/calendar?month=${currentMonth}`);
        if (cancelled) return;
        const rows = (data.tasks ?? []).map(rowToCalendarEvent) as CalendarEvent[];
        setEventDates(new Set(rows.map((r) => r.date)));

        const shootingByDate = new Map<string, { total: number; done: number }>();
        for (const r of rows) {
          if (r.category !== "shooting") continue;
          const prev = shootingByDate.get(r.date) ?? { total: 0, done: 0 };
          prev.total += 1;
          if (r.completed) prev.done += 1;
          shootingByDate.set(r.date, prev);
        }
        setDayCounts(shootingByDate);

        const today = todayStr();
        const upcoming = rows
          .filter((r) => r.date >= today)
          .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)))
          .slice(0, 8);
        setUpcomingEvents(upcoming);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "캘린더를 불러오지 못했습니다.");
      }
    })();
    return () => { cancelled = true; };
  }, [currentMonth]);

  // 선택 날짜 변경 → 그날 일정 리스트.
  useEffect(() => {
    let cancelled = false;
    setSchedulesLoading(true);
    (async () => {
      try {
        const data = await fetchJson(`/api/calendar?date=${selectedDate}`);
        if (cancelled) return;
        setSchedulesForDate((data.tasks ?? []).map(rowToCalendarEvent));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "일정을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setSchedulesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // 선택된 일정 해석 — schedulesForDate에서 먼저 찾고, URL 복원 등으로 아직 리스트에 없으면
  // /api/calendar?id=로 직접 조회한다(그 결과의 date로 selectedDate/currentMonth도 맞춰준다).
  useEffect(() => {
    if (!selectedScheduleId) { setSelectedSchedule(null); return; }
    const found = schedulesForDate.find((s) => s.id === selectedScheduleId);
    if (found) { setSelectedSchedule(found); return; }
    if (schedulesLoading) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson(`/api/calendar?id=${selectedScheduleId}`);
        if (cancelled) return;
        const resolved = (data.tasks ?? []).map(rowToCalendarEvent)[0] ?? null;
        setSelectedSchedule(resolved);
        if (resolved && resolved.date !== selectedDate) {
          setSelectedDate(resolved.date);
          setCurrentMonth(resolved.date.slice(0, 7));
        }
      } catch {
        if (!cancelled) setSelectedSchedule(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedScheduleId, schedulesForDate, schedulesLoading, selectedDate]);

  // To-do는 일정 카테고리와 무관하게 불러온다 — 준비사항(장비/렌탈)만 촬영 일정 전용.
  useEffect(() => {
    if (!selectedSchedule) {
      setTodos([]); setPrepItems([]); setRentals([]);
      return;
    }
    const isShooting = selectedSchedule.category === "shooting";
    let cancelled = false;
    setPrepLoading(true);
    (async () => {
      try {
        const [todosData, equipData, rentalsData] = await Promise.all([
          fetchJson(`/api/work-journal/schedule-todos?scheduleId=${selectedSchedule.id}`),
          isShooting ? fetchJson(`/api/work-journal/schedule-equipment?scheduleId=${selectedSchedule.id}`) : Promise.resolve({ items: [] }),
          isShooting ? fetchJson(`/api/work-journal/schedule-rentals?scheduleId=${selectedSchedule.id}`) : Promise.resolve({ rentals: [] }),
        ]);
        if (cancelled) return;
        setTodos(todosData.todos ?? []);
        setPrepItems(equipData.items ?? []);
        setRentals(rentalsData.rentals ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "준비사항을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setPrepLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchedule?.id, selectedSchedule?.category]);

  const handleAddTodo = async (input: { title: string; assignee?: string }) => {
    if (!selectedSchedule) return;
    const data = await fetchJson("/api/work-journal/schedule-todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: selectedSchedule.id, ...input }),
    });
    setTodos((prev) => [...prev, data.todo]);
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed } : t)));
    try {
      await fetchJson(`/api/work-journal/schedule-todos/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  const handleReorderTodo = async (id: string, direction: "up" | "down") => {
    const index = todos.findIndex((t) => t.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= todos.length) return;
    const next = [...todos];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setTodos(next);
    try {
      await Promise.all([
        fetchJson(`/api/work-journal/schedule-todos/${next[index].id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: index }) }),
        fetchJson(`/api/work-journal/schedule-todos/${next[targetIndex].id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: targetIndex }) }),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "순서 변경에 실패했습니다.");
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await fetchJson(`/api/work-journal/schedule-todos/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  const handleToggleEquipmentSelected = async (equipmentId: string, selected: boolean) => {
    if (!selectedSchedule) return;
    setPrepItems((prev) => prev.map((i) => (i.equipmentId === equipmentId ? { ...i, selected } : i)));
    try {
      const data = await fetchJson("/api/work-journal/schedule-equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: selectedSchedule.id, equipmentId, selected }),
      });
      setPrepItems((prev) => prev.map((i) => (i.equipmentId === equipmentId ? { ...i, scheduleEquipmentId: data.item.scheduleEquipmentId } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  const handleAddRental = async (name: string) => {
    if (!selectedSchedule) return;
    const data = await fetchJson("/api/work-journal/schedule-rentals", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduleId: selectedSchedule.id, name }),
    });
    setRentals((prev) => [...prev, data.rental]);
  };

  const handleToggleRental = async (id: string, checked: boolean) => {
    setRentals((prev) => prev.map((r) => (r.id === id ? { ...r, checked } : r)));
    try {
      await fetchJson(`/api/work-journal/schedule-rentals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ checked }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    }
  };

  const handleDeleteRental = async (id: string) => {
    setRentals((prev) => prev.filter((r) => r.id !== id));
    try {
      await fetchJson(`/api/work-journal/schedule-rentals/${id}`, { method: "DELETE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  };

  const upcomingEntries: UpcomingEntry[] = upcomingEvents.map((e) => ({
    kind: "event", id: e.id, date: e.date, time: e.time, title: e.title, done: e.completed,
  }));

  const isShooting = selectedSchedule?.category === "shooting";

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      <PageHeader title="업무일지" />
      <div className="pc-content pc-content--wide">
        <p style={{ fontSize: 13, color: C.muted, margin: "-8px 0 20px" }}>
          촬영 일정을 선택하면 To-do와 준비사항을 한 화면에서 관리할 수 있습니다.
        </p>
        {error ? <p style={{ fontSize: 12, color: C.danger, marginBottom: 12 }}>{error}</p> : null}

        <div
          className="wj-columns"
          style={{ display: "grid", gridTemplateColumns: "280px 1fr 360px", gap: 16, height: "calc(100vh - 260px)", minHeight: 560 }}
        >
          <ScheduleColumn
            currentMonth={currentMonth}
            selectedDate={selectedDate}
            dayCounts={dayCounts}
            eventDates={eventDates}
            onSelectDate={handleSelectDate}
            onMonthChange={setCurrentMonth}
            schedules={schedulesForDate}
            schedulesLoading={schedulesLoading}
            selectedScheduleId={selectedScheduleId}
            onSelectSchedule={handleSelectSchedule}
            upcoming={upcomingEntries}
            onSelectUpcoming={handleSelectUpcoming}
          />

          {isShooting && selectedSchedule ? (
            <TodoColumn
              schedule={selectedSchedule}
              todos={todos}
              loading={prepLoading}
              onAddTodo={handleAddTodo}
              onToggleTodo={handleToggleTodo}
              onReorderTodo={handleReorderTodo}
              onDeleteTodo={handleDeleteTodo}
            />
          ) : (
            <ScheduleDetailCard schedule={selectedSchedule} />
          )}

          {isShooting ? (
            <PreparationColumn
              prepItems={prepItems}
              prepLoading={prepLoading}
              rentals={rentals}
              onToggleSelected={handleToggleEquipmentSelected}
              onAddRental={handleAddRental}
              onToggleRental={handleToggleRental}
              onDeleteRental={handleDeleteRental}
            />
          ) : (
            <div className="pc-card pc-card--padded" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>
              <p style={{ fontSize: 12.5, color: C.hint, textAlign: "center" }}>촬영 일정에서만<br />준비사항을 관리합니다.</p>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1100px) {
          .wj-columns {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto auto !important;
            height: auto !important;
            min-height: 0 !important;
          }
          .wj-columns > div { height: 480px; }
        }
      `}</style>
    </main>
  );
}
