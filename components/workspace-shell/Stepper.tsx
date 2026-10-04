import { Check } from "lucide-react";
import styles from "./WorkspaceShell.module.css";

export type StepperItem = { id: string; label: string };

export function Stepper({ items, activeIndex, ariaLabel = "진행 단계" }: { items: StepperItem[]; activeIndex: number; ariaLabel?: string }) {
  return (
    <ol className={styles.stepper} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const state = index < activeIndex ? "complete" : index === activeIndex ? "active" : "upcoming";
        return (
          <li key={item.id} className={styles.step} data-state={state} aria-current={state === "active" ? "step" : undefined}>
            <i>{state === "complete" ? <Check size={13} /> : index + 1}</i><span>{item.label}</span>
            {index < items.length - 1 ? <span className={styles.stepConnector} aria-hidden="true" /> : null}
          </li>
        );
      })}
    </ol>
  );
}
