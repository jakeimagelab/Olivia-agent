"use client";

/* eslint-disable @next/next/no-img-element -- browser FileSystemHandle에서 생성한 로컬 썸네일 URL */

import { memo, type Dispatch, type SetStateAction } from "react";

import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import { hasSceneSelectionDifference } from "@/lib/selectMatch/selectionRendering";
import type { SelectMatchControlColors } from "./SelectMatchControls";

type SelectMatchScenePanelProps = {
  scene: SelectMatchFolderGroup;
  sourceSceneIndex: number;
  queryActive: boolean;
  isExpanded: boolean;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  setExpanded: Dispatch<SetStateAction<Set<number>>>;
  onLoadSceneThumbs: (sceneIndex: number) => void | Promise<void>;
  colors: SelectMatchControlColors;
};

function SelectMatchScenePanelComponent({
  scene,
  sourceSceneIndex,
  queryActive,
  isExpanded,
  selected,
  setSelected,
  setExpanded,
  onLoadSceneThumbs,
  colors,
}: SelectMatchScenePanelProps) {
  const selectedCount = scene.photos.filter((photo) => selected.has(photo.basename.toLowerCase())).length;

  return <div style={{ background: colors.surfaceCard, borderRadius: 12, border: `1px solid ${colors.uiBorder}`, overflow: "hidden", marginBottom: 10 }}>
    <div
      onClick={() => {
        if (queryActive) return;
        setExpanded((previous) => {
          const next = new Set(previous);
          if (next.has(sourceSceneIndex)) next.delete(sourceSceneIndex);
          else {
            next.add(sourceSceneIndex);
            void onLoadSceneThumbs(sourceSceneIndex);
          }
          return next;
        });
      }}
      style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: selectedCount > 0 ? colors.uiAccent : colors.uiBorder, display: "flex", alignItems: "center", justifyContent: "center", color: selectedCount > 0 ? "#103E36" : colors.uiMuted, fontSize: 12, fontWeight: 500, transition: "background .2s", flexShrink: 0 }}>{sourceSceneIndex + 1}</div>
        <div><div style={{ fontSize: 13, fontWeight: 500, color: colors.uiText }}>{scene.name}</div><div style={{ fontSize: 10, color: colors.uiHint }}>{scene.photos.length}장</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {selectedCount > 0 ? <span style={{ fontSize: 11, fontWeight: 500, color: colors.uiAccent, background: colors.groupedSurface, padding: "3px 10px", borderRadius: 12 }}>✓ {selectedCount}장</span> : null}
        <button
          onClick={(event) => {
            event.stopPropagation();
            const keys = scene.photos.map((photo) => photo.basename.toLowerCase());
            const allSelected = keys.every((key) => selected.has(key));
            setSelected((previous) => {
              const next = new Set(previous);
              if (allSelected) keys.forEach((key) => next.delete(key));
              else keys.forEach((key) => next.add(key));
              return next;
            });
          }}
          style={{ padding: "3px 8px", fontSize: 10, fontWeight: 500, background: colors.groupedSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 6, cursor: "pointer", color: colors.uiAccent, fontFamily: "inherit" }}
        >{scene.photos.every((photo) => selected.has(photo.basename.toLowerCase())) ? "해제" : "씬 전체"}</button>
        <span style={{ fontSize: 10, color: colors.uiHint, width: 12 }}>{isExpanded ? "▲" : "▼"}</span>
      </div>
    </div>
    {isExpanded ? <div style={{ borderTop: `1px solid ${colors.uiBorder}`, padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 6 }}>
        {scene.photos.map((photo) => {
          const key = photo.basename.toLowerCase();
          const isSelected = selected.has(key);
          return <div
            key={photo.name}
            onClick={() => setSelected((previous) => {
              const next = new Set(previous);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })}
            style={{ position: "relative", cursor: "pointer", borderRadius: 7, overflow: "hidden", border: `1.5px solid ${colors.uiBorder}`, aspectRatio: "3/2", background: "#e5eeec" }}
          >
            {photo.thumbUrl ? <img src={photo.thumbUrl} alt={photo.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ width: "100%", height: "100%", background: "#dde8e6" }} />}
            {isSelected ? <div style={{ position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: "50%", background: colors.uiAccent, boxShadow: "0 0 0 2px rgba(255,255,255,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#103E36", fontWeight: 600 }}>✓</div> : null}
            {photo.rating !== null ? <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,0,0,.6)", borderRadius: 4, padding: "1px 4px", fontSize: 8, color: "#FBBF24", letterSpacing: -1 }}>{"★".repeat(photo.rating)}{"☆".repeat(5 - photo.rating)}</div> : null}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.5)", padding: "2px 4px", fontSize: 7, color: "rgba(255,255,255,.9)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{photo.name}</div>
          </div>;
        })}
      </div>
    </div> : null}
  </div>;
}

function equalColors(previous: SelectMatchControlColors, next: SelectMatchControlColors) {
  return previous.surfaceCard === next.surfaceCard
    && previous.groupedSurface === next.groupedSurface
    && previous.inputSurface === next.inputSurface
    && previous.uiBorder === next.uiBorder
    && previous.uiText === next.uiText
    && previous.uiMuted === next.uiMuted
    && previous.uiHint === next.uiHint
    && previous.uiAccent === next.uiAccent;
}

export const SelectMatchScenePanel = memo(SelectMatchScenePanelComponent, (previous, next) => (
  previous.scene === next.scene
  && previous.sourceSceneIndex === next.sourceSceneIndex
  && previous.queryActive === next.queryActive
  && previous.isExpanded === next.isExpanded
  && previous.setSelected === next.setSelected
  && previous.setExpanded === next.setExpanded
  && previous.onLoadSceneThumbs === next.onLoadSceneThumbs
  && equalColors(previous.colors, next.colors)
  && !hasSceneSelectionDifference(next.scene.photos, previous.selected, next.selected)
));
