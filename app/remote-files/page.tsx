"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import MobileBottomNav from "@/components/olivia-mobile/MobileBottomNav";
import RemoteNasBrowser from "@/components/remote-nas/RemoteNasBrowser";
import { remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import type { MobilePrimaryView } from "@/lib/olivia/mobile/navigation";
import styles from "./page.module.css";

function RemoteFilesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPath = searchParams.get("path")?.trim() || "";
  const navigateMobile = (view: MobilePrimaryView) => {
    router.push(view === "home" ? "/" : `/?mobileView=${encodeURIComponent(view)}`);
  };

  return (
    <>
      <main className={styles.page}>
        <RemoteNasBrowser
          dataSource={remoteWorkerNasDataSource}
          initialPath={initialPath}
          onCancel={() => router.push("/")}
        />
      </main>
      <div className={styles.mobileDock}>
        <MobileBottomNav activeView="home" onNavigate={navigateMobile} />
      </div>
    </>
  );
}

export default function RemoteFilesPage() {
  return <Suspense fallback={<main className={styles.page}>원격 폴더를 준비하고 있어요...</main>}><RemoteFilesContent /></Suspense>;
}
