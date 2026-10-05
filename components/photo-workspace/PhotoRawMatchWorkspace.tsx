"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Clock3, Files } from "lucide-react";
import { DesktopWindowProvider } from "@/lib/desktopWindowContext";
import { WorkspaceSubTabs } from "@/components/workspace-shell/WorkspaceSubTabs";
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
}: {
  selectedJpgNames: readonly string[];
  initialMethod?: RawMatchMethod;
}) {
  const [method, setMethod] = useState<RawMatchMethod>(initialMethod);
  useEffect(() => setMethod(initialMethod), [initialMethod]);

  return (
    <div>
      <div style={{ marginBottom: 14, border: "1px solid rgba(79,216,184,.20)", borderRadius: 9, padding: "10px 12px", background: "rgba(79,216,184,.08)", color: "rgba(255,255,255,.68)", fontSize: 11.5, lineHeight: 1.6 }}>
        {selectedJpgNames.length
          ? <>사진 셀렉에서 확정한 JPG <strong style={{ color: "#a8f1dc" }}>{selectedJpgNames.length.toLocaleString("ko-KR")}장</strong>을 매칭 대상으로 불러왔습니다.</>
          : <>사진 셀렉을 거치지 않아도 됩니다. 아래에서 매칭할 JPG 폴더·파일명 목록을 직접 지정하세요.</>}
      </div>
      <WorkspaceSubTabs
        ariaLabel="RAW 매칭 방식"
        tone="dark"
        value={method}
        onChange={(next) => setMethod(next as RawMatchMethod)}
        items={[
          { value: "filename", label: "파일명 매칭", icon: <Files size={15} /> },
          { value: "metadata", label: "촬영시간 매칭", icon: <Clock3 size={15} /> },
        ]}
      />
      <div id="raw-match-method-panel" role="tabpanel" aria-labelledby={`raw-match-method-${method}`}>
        {method === "filename" ? <SelectMatchWorkspace embedded initialView="raw" selectedJpgNames={selectedJpgNames} /> : null}
        {method === "metadata" ? <DesktopWindowProvider value={true}><MetadataSelectWorkspace selectedJpgNames={selectedJpgNames} /></DesktopWindowProvider> : null}
      </div>
    </div>
  );
}
