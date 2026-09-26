export type CalendarTaskLike = {
  date?: string | null;
  title?: string | null;
  category?: string | null;
};

export function formatProjectMissionTitle(clientNameInput?: string | null, projectNameInput?: string | null) {
  const clientName = clientNameInput?.trim() || "이름 없는 고객";
  const projectName = projectNameInput?.trim() || "프로젝트";
  return projectName.startsWith(clientName) ? projectName : `${clientName} ${projectName}`;
}

export function resolveShootingSchedule({
  shootDate,
  tasks,
  clientName,
}: {
  shootDate?: string | null;
  tasks: CalendarTaskLike[];
  clientName?: string | null;
}) {
  const normalizedShootDate = shootDate?.trim() || null;
  const normalizedClientName = clientName?.trim() || "";
  const matchingTask = normalizedShootDate
    ? tasks.find((task) => {
        if (task.date !== normalizedShootDate) return false;
        const title = task.title?.trim() || "";
        return task.category === "shooting" || task.category === "shoot" || (normalizedClientName !== "" && title.includes(normalizedClientName));
      }) ?? null
    : null;

  return {
    shootDate: normalizedShootDate,
    matchingTask,
    isEmpty: !normalizedShootDate && tasks.length === 0,
    needsCalendarRegistration: Boolean(normalizedShootDate && !matchingTask),
  };
}
