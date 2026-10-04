"use client";

import { useEffect, useRef, useState } from "react";
import SegmentedTabs, { type SegmentedTabsItem } from "@/components/ui/SegmentedTabs";
import styles from "./WorkspaceShell.module.css";

export function WorkspaceTabs<T extends string>({ items, value, onChange, ariaLabel }: {
  items: SegmentedTabsItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const fullWidthRef = useRef(0);
  const [iconsOnly, setIconsOnly] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    const tabList = shell?.querySelector<HTMLElement>('[role="tablist"]');
    if (!shell || !tabList) return;
    const measure = () => {
      if (!iconsOnly) {
        fullWidthRef.current = Math.max(fullWidthRef.current, tabList.scrollWidth);
        if (tabList.scrollWidth > shell.clientWidth) setIconsOnly(true);
      } else if (shell.clientWidth >= fullWidthRef.current) {
        setIconsOnly(false);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    observer.observe(tabList);
    return () => observer.disconnect();
  }, [iconsOnly]);

  return (
    <div ref={shellRef} className={styles.tabsShell} data-icons-only={iconsOnly}>
      <SegmentedTabs ariaLabel={ariaLabel} value={value} onChange={onChange} items={items} />
    </div>
  );
}
