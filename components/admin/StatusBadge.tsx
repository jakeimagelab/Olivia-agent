import type { ReactNode } from "react";

export type StatusBadgeTone = "blue" | "orange" | "green" | "red" | "gray";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

export function StatusBadge({ children, tone = "gray" }: StatusBadgeProps) {
  return <span className={`oa-status-badge oa-status-badge--${tone}`}>{children}</span>;
}

export default StatusBadge;
