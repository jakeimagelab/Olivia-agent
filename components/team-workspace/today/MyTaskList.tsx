"use client";

import type { TeamTask } from "../types";
import TaskCard from "../tasks/TaskCard";

export default function MyTaskList({ tasks, title, empty, onOpen, onAction, busyId }: { tasks: TeamTask[]; title: string; empty: string; onOpen: (id: string) => void; onAction: (id: string, action: string) => void; busyId: string }) {
  return (
    <section className="team-card">
      <div className="team-card-header"><h3>{title}</h3><span style={{ fontSize: 11, fontWeight: 900 }}>{tasks.length}</span></div>
      <div className="team-card-body">{tasks.length ? <div style={{ display: "grid", gap: 9 }}>{tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={() => onOpen(task.id)} onAction={(action) => onAction(task.id, action)} busy={busyId === task.id} />)}</div> : <div className="team-empty">{empty}</div>}</div>
    </section>
  );
}
