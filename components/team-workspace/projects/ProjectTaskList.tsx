"use client";

import type { TeamTask } from "../types";
import TaskCard from "../tasks/TaskCard";

export default function ProjectTaskList({ tasks, onOpen }: { tasks: TeamTask[]; onOpen: (id: string) => void }) {
  return tasks.length ? <div style={{ display: "grid", gap: 9 }}>{tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={() => onOpen(task.id)} />)}</div> : <div className="team-empty">프로젝트 업무가 없습니다.</div>;
}
