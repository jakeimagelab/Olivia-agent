import type { ReactNode } from "react";
import styles from "./AnalysisWorkspace.module.css";

export default function AnalysisWorkspaceHeader({ title, description, eyebrow = "OLIVIA ANALYSIS", target }: {
  title: string;
  description: string;
  eyebrow?: string;
  target?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {target ? <aside>{target}</aside> : null}
    </header>
  );
}
