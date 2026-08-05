import WorkspacePage from "@/components/team-workspace/WorkspacePage";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const tab = query.tab === "chat" ? "chat" : "tasks";
  const taskId = typeof query.task === "string" ? query.task : null;

  return <WorkspacePage initialTab={tab} initialTaskId={taskId} />;
}
