"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, LogOut } from "lucide-react";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import type { PersonSelectMeData as MeData } from "./personSelectPublicModel";
import { clearPersonSelectImageCache } from "./usePersonSelectImages";
import styles from "./PersonSelectPublic.module.css";

export function PersonSelectHeader({ me, slug, desktopControls }: { me: MeData; slug: string; desktopControls?: ReactNode }) {
  const router = useRouter();
  return <header className={styles.topbar}>
    <div className={styles.brand}><i><ImageIcon size={16} /></i><span>{me.event.title}</span></div>
    {desktopControls ? <div className={styles.pcHeaderControls}>{desktopControls}</div> : null}
    <div className={styles.headerMeta}>
      <span className={styles.deadlineChip}>마감 {formatSeoulDeadline(me.event.deadline_at)}</span>
      <button className={styles.weak} aria-label="로그아웃" onClick={async () => { clearPersonSelectImageCache(slug); await fetch(`/api/pick/${slug}/logout`, { method: "POST" }); router.replace(`/pick/${slug}`); }}><LogOut size={17} /></button>
    </div>
  </header>;
}
