export function calculateProjectProgress(tasks: Array<{ status: string }>): number {
  const included = tasks.filter((task) => task.status !== "canceled");
  if (included.length === 0) return 0;
  const completed = included.filter((task) => task.status === "completed").length;
  return Math.round((completed / included.length) * 100);
}
