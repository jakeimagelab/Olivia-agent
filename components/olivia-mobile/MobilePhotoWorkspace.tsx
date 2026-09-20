"use client";

import dynamic from "next/dynamic";
import { PhotoStudioExecutionProvider } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import styles from "./OliviaMobileShell.module.css";

const PhotoWorkspace = dynamic(
  () => import("@/components/photo-workspace/PhotoWorkspace"),
  {
    ssr: false,
    loading: () => (
      <div className={styles.mobileFeatureLoading}>
        사진작업실을 준비하고 있어요...
      </div>
    ),
  },
);

export default function MobilePhotoWorkspace() {
  return (
    <section className={styles.screenWithHeader} aria-label="모바일 사진작업실">
      <div className={styles.mobilePhotoWorkspaceBody}>
        <PhotoStudioExecutionProvider>
          <PhotoStudioExecutionBar />
          <PhotoWorkspace hideHeader initialMode="classification" />
        </PhotoStudioExecutionProvider>
      </div>
    </section>
  );
}
