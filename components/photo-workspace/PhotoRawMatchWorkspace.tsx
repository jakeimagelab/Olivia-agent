"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Clock3, Files, Images } from "lucide-react";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import SegmentedTabs from "@/components/ui/SegmentedTabs";
import { SelectMatchWorkspace } from "./SelectMatchWorkspace";
import styles from "./PhotoWorkspace.module.css";

const MetadataSelectWorkspace = dynamic(
  () => import("@/components/metadata-select/MetadataSelectWorkspace"),
  {
    ssr: false,
    loading: () => <div className={styles.workspaceLoading}>촬영시간 RAW 매칭 도구를 불러오는 중...</div>,
  },
);

type RawMatchMethod = "filename" | "metadata";

/**
 * RAW matching has one responsibility: turn selected JPGs into their matching
 * RAW files.  Filename and EXIF-time matching are two methods of that same
 * operation, not separate photo-workspace tools.
 */
export default function PhotoRawMatchWorkspace({
  selectedJpgNames,
  initialMethod = "filename",
  onOpenPhotoSelect,
}: {
  selectedJpgNames: readonly string[];
  initialMethod?: RawMatchMethod;
  onOpenPhotoSelect: () => void;
}) {
  const [method, setMethod] = useState<RawMatchMethod>(initialMethod);
  useEffect(() => setMethod(initialMethod), [initialMethod]);

  if (selectedJpgNames.length === 0) {
    return (
      <section style={{ minHeight: 300, display: "grid", placeItems: "center", alignContent: "center", gap: 10, padding: 32, color: "rgba(255,255,255,.65)", textAlign: "center" }}>
        <Images size={28} color="#70d5bc" />
        <strong style={{ color: "#fff", fontSize: 16 }}>선택된 JPG 목록이 없습니다.</strong>
        <p style={{ maxWidth: 410, margin: 0, fontSize: 12, lineHeight: 1.65 }}>RAW 매칭은 사진 셀렉에서 확정한 JPG 목록만 사용합니다. 먼저 사진 셀렉에서 AI·직접·고객 선택 중 하나로 JPG를 선택하세요.</p>
        <button type="button" onClick={onOpenPhotoSelect} style={{ minHeight: 40, border: "1px solid #37c39d", borderRadius: 9, padding: "0 16px", background: "#37c39d", color: "#103e36", font: "800 12px/1 inherit", cursor: "pointer" }}>사진 셀렉으로 이동</button>
      </section>
    );
  }

  return (
    <div>
      <SegmentedTabs
        ariaLabel="RAW 매칭 방식"
        value={method}
        onChange={(next) => setMethod(next as RawMatchMethod)}
        items={[
          { value: "filename", label: "파일명 매칭", icon: <Files size={15} />, id: "raw-match-method-filename", panelId: "raw-match-method-panel" },
          { value: "metadata", label: "촬영시간 매칭", icon: <Clock3 size={15} />, id: "raw-match-method-metadata", panelId: "raw-match-method-panel" },
        ]}
        style={{ marginBottom: 14 }}
      />
      <div id="raw-match-method-panel" role="tabpanel" aria-labelledby={`raw-match-method-${method}`}>
        {method === "filename" ? <SelectMatchWorkspace embedded initialView="raw" selectedJpgNames={selectedJpgNames} /> : null}
        {method === "metadata" ? <DesktopWindowProvider value={true}><MetadataSelectWorkspace selectedJpgNames={selectedJpgNames} /></DesktopWindowProvider> : null}
      </div>
    </div>
  );
}
