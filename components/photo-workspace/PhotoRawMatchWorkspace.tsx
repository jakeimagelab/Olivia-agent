"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { SelectMatchWorkspace } from "./SelectMatchWorkspace";
import RemoteBridgeRawMatchWorkspace from "./RemoteBridgeRawMatchWorkspace";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { resolveBridgeSelectedIdsByName } from "@/lib/photo-bridge/selectionProjection";
import type { BridgeRawMatchTargetMode } from "@/lib/photo-bridge/rawMatchDelivery";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

const PhotoSourcePicker = dynamic(
  () => import("@/components/photo-classifier/PhotoSourcePicker"),
  { ssr: false },
);

/**
 * RAW 매칭은 파일명 후보를 촬영시각으로 다시 확인한 뒤만 실행한다.
 * 별도의 촬영시간 탭은 같은 검사를 중복했므로 노출하지 않는다.
 */
export default function PhotoRawMatchWorkspace({
  selectedJpgNames,
  bridgeJpgs = [],
  bridgeLinked = false,
  bridgeTargetMode = "criteria",
}: {
  selectedJpgNames: readonly string[];
  bridgeJpgs?: readonly BridgeJpgFile[];
  bridgeLinked?: boolean;
  bridgeTargetMode?: BridgeRawMatchTargetMode;
}) {
  const [nasPickerOpen, setNasPickerOpen] = useState(false);
  const [nasSelection, setNasSelection] = useState<RemoteNasSelection | null>(null);
  const [nasTargetNames, setNasTargetNames] = useState<string[]>([]);
  const nasSelectedJpgs = useMemo(() => {
    const selectedIds = resolveBridgeSelectedIdsByName(bridgeJpgs, nasTargetNames);
    return bridgeJpgs.filter((jpg) => selectedIds.has(jpg.id));
  }, [bridgeJpgs, nasTargetNames]);

  const openNasPicker = useCallback((targetNames: readonly string[]) => {
    setNasTargetNames([...targetNames]);
    setNasPickerOpen(true);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 14, border: "1px solid rgba(79,216,184,.20)", borderRadius: 9, padding: "10px 12px", background: "rgba(79,216,184,.08)", color: "rgba(255,255,255,.68)", fontSize: 11.5, lineHeight: 1.6 }}>
        {selectedJpgNames.length
          ? <>{bridgeLinked && bridgeTargetMode === "active-selection" ? "Bridge에서 직접 고른 작업 대상" : "사진 셀렉에서 확정한 JPG"} <strong style={{ color: "#a8f1dc" }}>{selectedJpgNames.length.toLocaleString("ko-KR")}장</strong>을 매칭 대상으로 불러왔습니다.</>
          : <>사진 셀렉을 거치지 않아도 됩니다. 아래에서 매칭할 JPG 폴더·파일명 목록을 직접 지정하세요.</>}
      </div>
      {nasSelection ? <RemoteBridgeRawMatchWorkspace
        remoteSelection={nasSelection}
        selectedJpgs={nasSelectedJpgs}
        rawOnly
        dark
        onChangeNasFolder={() => setNasPickerOpen(true)}
        onUseLocalFolder={() => setNasSelection(null)}
      /> : <SelectMatchWorkspace
        embedded
        bridgeLinked={bridgeLinked}
        bridgeTargetMode={bridgeTargetMode}
        initialView="raw"
        selectedJpgNames={selectedJpgNames}
        onPickNasRawFolder={bridgeLinked && bridgeJpgs.length ? openNasPicker : undefined}
      />}
      {nasPickerOpen ? <PhotoSourcePicker
        sourceScope="person-select"
        rootLabel="NAS 촬영 폴더"
        onCancel={() => setNasPickerOpen(false)}
        onSelectRemote={(selection) => {
          setNasPickerOpen(false);
          setNasSelection(selection);
        }}
      /> : null}
    </div>
  );
}
