"use client";

import { SelectMatchWorkspace } from "./SelectMatchWorkspace";
import type { BridgeRawMatchTargetMode } from "@/lib/photo-bridge/rawMatchDelivery";

/**
 * RAW 매칭은 파일명 후보를 촬영시각으로 다시 확인한 뒤만 실행한다.
 * 별도의 촬영시간 탭은 같은 검사를 중복했므로 노출하지 않는다.
 */
export default function PhotoRawMatchWorkspace({
  selectedJpgNames,
  bridgeLinked = false,
  bridgeTargetMode = "criteria",
}: {
  selectedJpgNames: readonly string[];
  bridgeLinked?: boolean;
  bridgeTargetMode?: BridgeRawMatchTargetMode;
}) {
  return (
    <div>
      <div style={{ marginBottom: 14, border: "1px solid rgba(79,216,184,.20)", borderRadius: 9, padding: "10px 12px", background: "rgba(79,216,184,.08)", color: "rgba(255,255,255,.68)", fontSize: 11.5, lineHeight: 1.6 }}>
        {selectedJpgNames.length
          ? <>{bridgeLinked && bridgeTargetMode === "active-selection" ? "Bridge에서 직접 고른 작업 대상" : "사진 셀렉에서 확정한 JPG"} <strong style={{ color: "#a8f1dc" }}>{selectedJpgNames.length.toLocaleString("ko-KR")}장</strong>을 매칭 대상으로 불러왔습니다.</>
          : <>사진 셀렉을 거치지 않아도 됩니다. 아래에서 매칭할 JPG 폴더·파일명 목록을 직접 지정하세요.</>}
      </div>
      <SelectMatchWorkspace embedded bridgeLinked={bridgeLinked} bridgeTargetMode={bridgeTargetMode} initialView="raw" selectedJpgNames={selectedJpgNames} />
    </div>
  );
}
