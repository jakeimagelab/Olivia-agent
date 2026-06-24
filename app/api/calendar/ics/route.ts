import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function toICSDateTime(date: string, time?: string | null) {
  const d = date.replace(/-/g, "");
  if (time) {
    const t = time.replace(":", "") + "00";
    return { allDay: false, start: `${d}T${t}`, end: `${d}T${String(Number(time.split(":")[0]) + 1).padStart(2,"0")}${time.split(":")[1]}00` };
  }
  return { allDay: true, start: d, end: d };
}

export async function GET() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("calendar_tasks")
    .select("*")
    .order("date", { ascending: true });

  if (error) return new NextResponse("DB Error", { status: 500 });

  const tasks = data ?? [];
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Olivia Agent//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Olivia 업무 캘린더",
    "X-WR-CALDESC:포토클리닉 업무 캘린더",
    "X-WR-TIMEZONE:Asia/Seoul",
  ];

  for (const t of tasks) {
    const { allDay, start, end } = toICSDateTime(t.date, t.time);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${t.id}@olivia-calendar`);
    lines.push(`SUMMARY:${esc(t.title)}`);
    if (allDay) {
      lines.push(`DTSTART;VALUE=DATE:${start}`);
      lines.push(`DTEND;VALUE=DATE:${end}`);
    } else {
      lines.push(`DTSTART;TZID=Asia/Seoul:${start}`);
      lines.push(`DTEND;TZID=Asia/Seoul:${end}`);
    }
    if (t.location) lines.push(`LOCATION:${esc(t.location)}`);
    if (t.memo)     lines.push(`DESCRIPTION:${esc(t.memo)}`);
    lines.push(`STATUS:${t.completed ? "COMPLETED" : "CONFIRMED"}`);
    lines.push(`CATEGORIES:${t.category}`);
    lines.push(`CREATED:${new Date(t.created_at).toISOString().replace(/[-:.]/g,"").slice(0,15)}Z`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
