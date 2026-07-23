import { redirect } from "next/navigation";

export default async function TeamTasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const target = new URLSearchParams({ tab: "tasks" });
  if (typeof query.task === "string") target.set("task", query.task);
  redirect(`/team?${target.toString()}`);
}
