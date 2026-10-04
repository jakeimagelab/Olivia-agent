"use client";

import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./WorkspaceShell.module.css";

export function WorkspaceGrid({ children, guide, forceSingleColumn = false }: {
  children: ReactNode;
  guide?: ReactNode;
  forceSingleColumn?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const guideId = useId();
  const [compact, setCompact] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const next = root.clientWidth < 900;
      setCompact(next);
      if (!next) setGuideOpen(false);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const singleColumn = compact || forceSingleColumn || !guide;
  return (
    <div ref={rootRef}>
      {compact && guide ? (
        <button type="button" className={styles.guideToggle} aria-expanded={guideOpen} aria-controls={guideId} onClick={() => setGuideOpen((open) => !open)}>
          {guideOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          {guideOpen ? "사용 가이드 닫기" : "사용 가이드 보기"}
        </button>
      ) : null}
      <div className={`${styles.grid} ${singleColumn ? styles.gridCompact : ""}`}>
        {children}
        {guide && (!compact || guideOpen) ? <div id={guideId}>{guide}</div> : null}
      </div>
    </div>
  );
}
