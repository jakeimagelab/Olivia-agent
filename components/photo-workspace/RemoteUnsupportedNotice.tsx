"use client";

import { Server } from "lucide-react";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./RemoteUnsupportedNotice.module.css";

export default function RemoteUnsupportedNotice({ feature }: { feature: string }) {
  const { availableModes, setExecutionMode } = usePhotoStudioExecution();
  const canUseLocal = availableModes.includes("LOCAL_DIRECT");
  return (
    <section className={styles.notice} aria-label={`${feature} 원격 실행 안내`}>
      <span><Server size={25} strokeWidth={1.6} /></span>
      <h2>Mac Studio 원격 실행 준비 중</h2>
      <p>{canUseLocal ? `${feature} 기능은 현재 이 기기에서 실행할 수 있습니다. 기존 로컬 기능은 그대로 유지됩니다.` : `${feature}의 Mac Studio 원격 실행은 아직 준비 중입니다.`}</p>
      {canUseLocal ? <button type="button" onClick={() => setExecutionMode("LOCAL_DIRECT")}>이 기기에서 작업하기</button> : null}
    </section>
  );
}
