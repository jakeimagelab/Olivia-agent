"use client";

import dynamic from "next/dynamic";
import { HardDrive, Laptop, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { SelectMatchWorkspace } from "./SelectMatchWorkspace";
import RemoteBridgeRawMatchWorkspace from "./RemoteBridgeRawMatchWorkspace";
import type { BridgeJpgFile } from "@/lib/photo-bridge/bridgeFiles";
import { resolveBridgeSelectedIdsByName } from "@/lib/photo-bridge/selectionProjection";
import {
  DEFAULT_RAW_MATCH_CRITERIA,
  normalizeRawMatchCriteria,
  resolveBridgeRawMatchTargets,
  type BridgeRawMatchTargetMode,
  type RawMatchCriteria,
} from "@/lib/photo-bridge/rawMatchDelivery";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import {
  readNasRawMatchPreference,
  writeNasRawMatchPreference,
} from "@/lib/selectMatch/nasRawMatchPreference";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";

const PhotoSourcePicker = dynamic(
  () => import("@/components/photo-classifier/PhotoSourcePicker"),
  { ssr: false },
);

function criteriaLabel(mode: BridgeRawMatchTargetMode, criteria: RawMatchCriteria): string {
  if (mode === "active-selection") return "Bridge 작업 대상";
  const rating = `★${criteria.minRating} 이상`;
  const colors = criteria.colorLabels.join("·");
  if (criteria.source === "rating") return `별점 ${rating}`;
  if (criteria.source === "color") return `컬러 ${colors || "선택 없음"}`;
  return `${rating} 또는 컬러 ${colors || "선택 없음"}`;
}

function RawMatchLocationChoice({
  selectedCount,
  selectionLabel,
  nasDisabledReason,
  onUseLocal,
  onUseNas,
}: {
  selectedCount: number;
  selectionLabel: string;
  nasDisabledReason?: string;
  onUseLocal: () => void;
  onUseNas: () => void;
}) {
  const border = "rgba(255,255,255,.13)";
  const muted = "rgba(255,255,255,.55)";
  return (
    <section style={{ maxWidth: 640, margin: "32px auto", padding: "0 24px" }}>
      <div style={{ border: `1px solid ${border}`, borderRadius: 14, background: "rgba(255,255,255,.04)", padding: 22 }}>
        <strong style={{ display: "block", color: "rgba(255,255,255,.90)", fontSize: 16, fontWeight: 600 }}>RAW를 어디에서 찾을까요?</strong>
        <p style={{ margin: "7px 0 0", color: muted, fontSize: 12, lineHeight: 1.7 }}>
          작업 대상 <b style={{ color: "#4FD8B8", fontWeight: 500 }}>{selectedCount.toLocaleString("ko-KR")}장</b> · {selectionLabel}<br />
          이 기기의 RAW 또는 Mac Studio가 연결된 NAS 원본을 선택하세요.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10, marginTop: 18 }}>
          <button type="button" onClick={onUseLocal} style={{ minHeight: 72, display: "flex", alignItems: "center", gap: 12, border: `1px solid rgba(255,255,255,.28)`, borderRadius: 10, padding: "12px 14px", background: "transparent", color: "rgba(255,255,255,.88)", font: "inherit", textAlign: "left", cursor: "pointer" }}>
            <Laptop size={19} aria-hidden="true" />
            <span><b style={{ display: "block", fontSize: 13, fontWeight: 500 }}>이 기기에서 찾기</b><small style={{ display: "block", marginTop: 4, color: muted, fontSize: 11 }}>노트북에 연결된 RAW 폴더를 사용합니다.</small></span>
          </button>
          <button type="button" disabled={Boolean(nasDisabledReason)} onClick={onUseNas} style={{ minHeight: 72, display: "flex", alignItems: "center", gap: 12, border: `1px solid ${nasDisabledReason ? border : "rgba(255,255,255,.28)"}`, borderRadius: 10, padding: "12px 14px", background: "transparent", color: nasDisabledReason ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.88)", font: "inherit", textAlign: "left", cursor: nasDisabledReason ? "not-allowed" : "pointer" }}>
            <HardDrive size={19} aria-hidden="true" />
            <span><b style={{ display: "block", fontSize: 13, fontWeight: 500 }}>NAS에서 찾기</b><small style={{ display: "block", marginTop: 4, color: nasDisabledReason ? "rgba(255,255,255,.28)" : muted, fontSize: 11 }}>Mac Studio가 NAS RAW를 찾아 복사합니다.</small></span>
          </button>
        </div>
        {nasDisabledReason ? <p style={{ margin: "10px 0 0", color: "#F0A98C", fontSize: 11 }}>{nasDisabledReason}</p> : null}
      </div>
    </section>
  );
}

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
  const {
    currentLocalFolder,
    jpgRatingsByName,
    jpgColorLabelsByName,
    rawMatchFolderPath,
    workerPresence,
  } = usePhotoStudioExecution();
  const [nasPickerOpen, setNasPickerOpen] = useState(false);
  const [nasSelection, setNasSelection] = useState<RemoteNasSelection | null>(null);
  const [nasTargetNames, setNasTargetNames] = useState<string[]>([]);
  const [useLocalMatcher, setUseLocalMatcher] = useState(!bridgeLinked || !bridgeJpgs.length);
  const [preferenceReady, setPreferenceReady] = useState(!bridgeLinked || !bridgeJpgs.length);
  const [quickCriteria, setQuickCriteria] = useState<RawMatchCriteria>(DEFAULT_RAW_MATCH_CRITERIA);
  const folderIdentity = rawMatchFolderPath || currentLocalFolder?.name || "";
  const quickNasTargetNames = useMemo(() => [...resolveBridgeRawMatchTargets({
    mode: bridgeTargetMode,
    names: selectedJpgNames,
    ratingsByName: jpgRatingsByName,
    colorsByName: jpgColorLabelsByName,
    criteria: quickCriteria,
  })], [bridgeTargetMode, jpgColorLabelsByName, jpgRatingsByName, quickCriteria, selectedJpgNames]);
  const activeNasTargetNames = nasTargetNames.length ? nasTargetNames : quickNasTargetNames;
  const nasSelectedJpgs = useMemo(() => {
    const selectedIds = resolveBridgeSelectedIdsByName(bridgeJpgs, activeNasTargetNames);
    return bridgeJpgs.filter((jpg) => selectedIds.has(jpg.id));
  }, [activeNasTargetNames, bridgeJpgs]);

  useEffect(() => {
    if (!bridgeLinked || !bridgeJpgs.length) {
      setPreferenceReady(true);
      return;
    }
    setPreferenceReady(false);
    let criteria = DEFAULT_RAW_MATCH_CRITERIA;
    try {
      criteria = normalizeRawMatchCriteria(JSON.parse(localStorage.getItem(`olivia-raw-match-criteria:${folderIdentity || "current-folder"}`) ?? "null"));
    } catch {
      criteria = DEFAULT_RAW_MATCH_CRITERIA;
    }
    setQuickCriteria(criteria);
    setNasSelection(folderIdentity ? readNasRawMatchPreference(localStorage, folderIdentity) : null);
    setNasTargetNames([]);
    setUseLocalMatcher(false);
    setPreferenceReady(true);
  }, [bridgeJpgs.length, bridgeLinked, folderIdentity]);

  const openNasPicker = useCallback((targetNames: readonly string[]) => {
    setNasTargetNames([...targetNames]);
    setNasPickerOpen(true);
  }, []);

  const selectNasFolder = useCallback((selection: RemoteNasSelection) => {
    setNasPickerOpen(false);
    setNasSelection(selection);
    setUseLocalMatcher(false);
    if (folderIdentity) writeNasRawMatchPreference(localStorage, folderIdentity, selection);
  }, [folderIdentity]);

  const nasDisabledReason = workerPresence.online === false
    ? "Mac Studio가 꺼져 있어요. 켠 뒤 다시 시도해 주세요."
    : workerPresence.online === null
      ? "Mac Studio 연결 상태를 확인하고 있어요."
      : quickNasTargetNames.length === 0
        ? "Bridge에서 매칭할 사진을 먼저 골라 주세요."
        : undefined;
  const showBridgeLocationChoice = bridgeLinked && bridgeJpgs.length > 0 && !useLocalMatcher && !nasSelection;
  const headerTargetCount = nasSelection ? activeNasTargetNames.length : quickNasTargetNames.length;
  const displayedTargetCount = bridgeLinked ? headerTargetCount : selectedJpgNames.length;

  return (
    <div>
      <div style={{ marginBottom: 14, border: "1px solid rgba(79,216,184,.20)", borderRadius: 9, padding: "10px 12px", background: "rgba(79,216,184,.08)", color: "rgba(255,255,255,.68)", fontSize: 11.5, lineHeight: 1.6 }}>
        {bridgeLinked || displayedTargetCount
          ? <>{bridgeLinked && bridgeTargetMode === "active-selection" ? "Bridge에서 직접 고른 작업 대상" : "사진 셀렉에서 확정한 JPG"} <strong style={{ color: "#a8f1dc" }}>{displayedTargetCount.toLocaleString("ko-KR")}장</strong>을 매칭 대상으로 불러왔습니다.</>
          : <>사진 셀렉을 거치지 않아도 됩니다. 아래에서 매칭할 JPG 폴더·파일명 목록을 직접 지정하세요.</>}
      </div>
      {!preferenceReady ? <div role="status" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, minHeight: 180, color: "rgba(255,255,255,.55)", fontSize: 12 }}><LoaderCircle size={16} className="spin" />이전에 사용한 RAW 위치를 확인하고 있어요.</div> : null}
      {preferenceReady && showBridgeLocationChoice ? <RawMatchLocationChoice
        selectedCount={quickNasTargetNames.length}
        selectionLabel={criteriaLabel(bridgeTargetMode, quickCriteria)}
        nasDisabledReason={nasDisabledReason}
        onUseLocal={() => setUseLocalMatcher(true)}
        onUseNas={() => openNasPicker(quickNasTargetNames)}
      /> : null}
      {preferenceReady && !useLocalMatcher && nasSelection ? <RemoteBridgeRawMatchWorkspace
        remoteSelection={nasSelection}
        selectedJpgs={nasSelectedJpgs}
        rawOnly
        dark
        onChangeNasFolder={() => setNasPickerOpen(true)}
        onUseLocalFolder={() => setUseLocalMatcher(true)}
      /> : null}
      {preferenceReady && (useLocalMatcher || (!bridgeLinked && !nasSelection)) ? <SelectMatchWorkspace
        embedded
        bridgeLinked={bridgeLinked}
        bridgeTargetMode={bridgeTargetMode}
        initialView="raw"
        selectedJpgNames={selectedJpgNames}
        onPickNasRawFolder={bridgeLinked && bridgeJpgs.length ? openNasPicker : undefined}
      /> : null}
      {nasPickerOpen ? <PhotoSourcePicker
        sourceScope="person-select"
        rootLabel="NAS 촬영 폴더"
        onCancel={() => setNasPickerOpen(false)}
        onSelectRemote={selectNasFolder}
      /> : null}
    </div>
  );
}
