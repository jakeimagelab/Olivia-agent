import { C } from "@/lib/theme";
import { TASK_STATUS_LABEL, type TeamTaskStatus } from "../types";

const COLORS: Record<TeamTaskStatus | "overdue", string> = {
  todo: "#7C9893",
  in_progress: "#167A87",
  review: C.orange,
  completed: C.success,
  on_hold: "#8A9996",
  canceled: "#6B7280",
  overdue: C.danger,
};

export default function TaskStatusBadge({ status, overdue = false }: { status: TeamTaskStatus; overdue?: boolean }) {
  const key = overdue ? "overdue" : status;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", minHeight: 23, borderRadius: 999,
      padding: "0 8px", fontSize: 10, fontWeight: 900,
      color: COLORS[key], background: `${COLORS[key]}12`, border: `1px solid ${COLORS[key]}25`,
    }}>
      {overdue ? "지연" : TASK_STATUS_LABEL[status]}
    </span>
  );
}
