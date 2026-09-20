"use client";

import { useRouter } from "next/navigation";
import RemoteNasBrowser from "@/components/remote-nas/RemoteNasBrowser";
import { remoteWorkerNasDataSource } from "@/lib/remote-nas/remoteNasDataSource";
import styles from "./page.module.css";

export default function RemoteFilesPage() {
  const router = useRouter();

  return (
    <main className={styles.page}>
      <RemoteNasBrowser
        dataSource={remoteWorkerNasDataSource}
        onCancel={() => router.push("/")}
      />
    </main>
  );
}
