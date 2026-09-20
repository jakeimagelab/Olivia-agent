"use client";

import { useRouter } from "next/navigation";
import MobileBottomNav from "@/components/olivia-mobile/MobileBottomNav";
import RemoteNasBrowser from "@/components/remote-nas/RemoteNasBrowser";
import { remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./page.module.css";

export default function RemoteFilesPage() {
  const router = useRouter();
  const navigateMobile = (view: MobilePrimaryView) => {
    router.push(view === "home" ? "/" : `/?mobileView=${encodeURIComponent(view)}`);
  };

  return (
    <>
      <main className={styles.page}>
        <RemoteNasBrowser
          dataSource={remoteWorkerNasDataSource}
          onCancel={() => router.push("/")}
        />
      </main>
      <div className={styles.mobileDock}>
        <MobileBottomNav activeView="home" onNavigate={navigateMobile} />
      </div>
    </>
  );
}
