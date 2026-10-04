import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export type GuideStep = { icon: LucideIcon; title: string; description: string };

export function GuidePanel({ title = "사용 가이드", intro, steps, tip, ariaLabel = "사용 가이드" }: {
  title?: string;
  intro?: ReactNode;
  steps: GuideStep[];
  tip?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <aside className={styles.guide} aria-label={ariaLabel}>
      <h2>{title}</h2>
      {intro ? <div className={styles.guideIntro}>{intro}</div> : null}
      <ol className={styles.guideSteps}>
        {steps.map(({ icon: Icon, title: stepTitle, description }, index) => (
          <li key={`${stepTitle}-${index}`} className={styles.guideStep}>
            <span className={styles.guideIcon} aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span>
            <span className={styles.guideNumber}>{index + 1}</span>
            <span className={styles.guideCopy}><strong>{stepTitle}</strong><small>{description}</small></span>
          </li>
        ))}
      </ol>
      {tip ? <div className={styles.tip}>{tip}</div> : null}
    </aside>
  );
}
