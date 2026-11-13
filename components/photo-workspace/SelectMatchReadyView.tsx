"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { FolderOpen } from "lucide-react";

import type { SelectMatchFolderGroup } from "@/lib/selectMatch/folderScanner";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";
import { SelectMatchScenePanel } from "./SelectMatchScenePanel";

export function SelectMatchReadyView({
  scenes,
  visibleScenes,
  queryTokens,
  nameQuery,
  onNameQueryChange,
  matchedCount,
  totalPhotos,
  selected,
  setSelected,
  expanded,
  setExpanded,
  ratingLoading,
  onAutoSelectByRating,
  onLoadEmbeddedRatings,
  selectionOnly,
  bridgeLinked,
  rawRootDir,
  onCompleteSelection,
  onRunPreflight,
  onPickRawFolder,
  onChangeFolder,
  onLoadSceneThumbs,
  colors,
}: {
  scenes: SelectMatchFolderGroup[];
  visibleScenes: SelectMatchFolderGroup[];
  queryTokens: readonly string[];
  nameQuery: string;
  onNameQueryChange: (value: string) => void;
  matchedCount: number;
  totalPhotos: number;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  expanded: Set<number>;
  setExpanded: Dispatch<SetStateAction<Set<number>>>;
  ratingLoading: boolean;
  onAutoSelectByRating: (minimumRating: number) => void;
  onLoadEmbeddedRatings: () => void | Promise<void>;
  selectionOnly: boolean;
  bridgeLinked: boolean;
  rawRootDir: FileSystemDirectoryHandle | null;
  onCompleteSelection: (names: Set<string>) => void;
  onRunPreflight: () => void | Promise<void>;
  onPickRawFolder: () => void | Promise<void>;
  onChangeFolder: () => void;
  onLoadSceneThumbs: (sceneIndex: number) => void | Promise<void>;
  colors: SelectMatchControlColors;
}) {
  const { ratingCounts, hasAnyRating } = useMemo(() => {
    const photos = scenes.flatMap((scene) => scene.photos);
    return {
      ratingCounts: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: photos.filter((photo) => photo.rating !== null && photo.rating >= rating).length,
      })),
      hasAnyRating: photos.some((photo) => photo.rating !== null),
    };
  }, [scenes]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px" }}>
      <div style={{ background: "rgba(214,188,125,.12)", border: "1px solid rgba(214,188,125,.36)", borderRadius: 12, padding: "12px 18px", marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#92400E" }}>
          ⭐ Bridge 별점으로 자동 선택
          {ratingLoading ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: "#B45309" }}>읽는 중...</span> : null}
        </div>
        {hasAnyRating ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ratingCounts.map(({ rating, count }) => <button
            key={rating}
            onClick={() => onAutoSelectByRating(rating)}
            disabled={count === 0}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 8,
              border: "1px solid #FDE68A",
              cursor: count === 0 ? "not-allowed" : "pointer",
              background: count > 0 ? "#FEF3C7" : "#F9FAFB",
              color: count > 0 ? "#92400E" : "#9CA3AF",
              fontFamily: "inherit",
            }}
          >{"★".repeat(rating)}{"☆".repeat(5 - rating)} 이상 ({count}장)</button>)}
        </div> : <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#B45309" }}>{ratingLoading ? "XMP 사이드카 스캔 중..." : "사이드카(.xmp) 없음 — JPG 내 XMP 스캔"}</span>
          {!ratingLoading ? <button
            onClick={() => void onLoadEmbeddedRatings()}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: 500, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, cursor: "pointer", color: "#92400E", fontFamily: "inherit" }}
          >JPG에서 별점 읽기</button> : null}
        </div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: colors.surfaceCard, borderRadius: 12, border: `1px solid ${colors.uiBorder}`, padding: "12px 18px", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.uiAccent }}>{selected.size}장 선택됨</span>
            <span style={{ fontSize: 11, color: colors.uiHint, marginLeft: 8 }}>{queryTokens.length ? `${matchedCount}장 찾음 / 전체 ${totalPhotos}장` : `/ 전체 ${totalPhotos}장 (${scenes.length}씬)`}</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={() => setSelected(new Set(scenes.flatMap((scene) => scene.photos.map((photo) => photo.basename.toLowerCase()))))}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: colors.groupedSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 6, cursor: "pointer", color: colors.uiAccent, fontFamily: "inherit" }}
            >전체 선택</button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 6, cursor: "pointer", color: colors.uiMuted, fontFamily: "inherit" }}
            >전체 해제</button>
            <input
              type="search"
              value={nameQuery}
              onChange={(event) => onNameQueryChange(event.currentTarget.value)}
              placeholder="파일명 검색 (R5K, DSC…)"
              aria-label="파일명 검색"
              autoComplete="off"
              style={{ width: 190, maxWidth: "100%", padding: "4px 10px", fontSize: 11, background: colors.inputSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 6, color: colors.uiText, fontFamily: "inherit", outline: "none" }}
            />
            {queryTokens.length ? <button
              type="button"
              onClick={() => setSelected((previous) => {
                const next = new Set(previous);
                for (const scene of visibleScenes) {
                  for (const photo of scene.photos) next.add(photo.basename.toLowerCase());
                }
                return next;
              })}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 500, background: colors.groupedSurface, border: `1px solid ${colors.uiBorder}`, borderRadius: 6, cursor: "pointer", color: colors.uiAccent, fontFamily: "inherit", whiteSpace: "nowrap" }}
            >검색 결과 {matchedCount}장 선택</button> : null}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {selectionOnly ? <SelectMatchButton onClick={() => onCompleteSelection(selected)} disabled={selected.size === 0}>
            {selected.size > 0 ? `선택 ${selected.size}장 저장` : "사진을 선택하세요"}
          </SelectMatchButton> : <>
            <SelectMatchButton onClick={() => void onRunPreflight()} disabled={selected.size === 0}>
              {selected.size > 0 ? `${selected.size}장 RAW 매칭 확인` : "사진을 선택하세요"}
            </SelectMatchButton>
            <button
              onClick={() => void onPickRawFolder()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                background: rawRootDir ? "#DCFCE7" : "#FEF9C3",
                border: `1px solid ${rawRootDir ? "#86EFAC" : "#FDE68A"}`,
                borderRadius: 8,
                color: rawRootDir ? "#166534" : "#92400E",
              }}
              title={rawRootDir ? `RAW 폴더: ${rawRootDir.name}` : "RAW 파일이 있는 폴더를 별도로 선택"}
            >{rawRootDir ? <><FolderOpen size={14} aria-hidden="true" />{rawRootDir.name}</> : <><FolderOpen size={14} aria-hidden="true" />RAW 폴더 선택</>}</button>
          </>}
          {!bridgeLinked ? <button
            onClick={onChangeFolder}
            style={{ padding: "6px 10px", fontSize: 11, background: "transparent", border: `1px solid ${colors.uiBorder}`, borderRadius: 8, cursor: "pointer", color: colors.uiMuted, fontFamily: "inherit" }}
          >폴더 변경</button> : null}
        </div>
      </div>

      {scenes.length === 0 ? <div style={{ textAlign: "center", padding: "60px 0", color: colors.uiHint, fontSize: 13 }}>JPG 파일을 찾지 못했습니다. 폴더를 다시 확인해주세요.</div> : queryTokens.length && visibleScenes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: colors.uiHint, fontSize: 13 }}>&quot;{nameQuery.trim()}&quot;와 맞는 파일이 없습니다</div>
      ) : visibleScenes.map((scene, visibleIndex) => {
        const sourceSceneIndex = queryTokens.length
          ? scenes.findIndex((candidate) => candidate.dirHandle === scene.dirHandle)
          : visibleIndex;
        return <SelectMatchScenePanel
          key={sourceSceneIndex}
          scene={scene}
          sourceSceneIndex={sourceSceneIndex}
          queryActive={queryTokens.length > 0}
          isExpanded={queryTokens.length > 0 || expanded.has(sourceSceneIndex)}
          selected={selected}
          setSelected={setSelected}
          setExpanded={setExpanded}
          onLoadSceneThumbs={onLoadSceneThumbs}
          colors={colors}
        />;
      })}

      {selected.size > 0 ? <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "all", background: colors.uiAccent, color: "#103E36", borderRadius: 999, padding: "10px 12px 10px 22px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 4px 20px rgba(21,88,85,.35)" }}>
          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>{selected.size}장 선택됨</span>
          <button onClick={() => setSelected(new Set())} style={{ padding: "7px 16px", background: "transparent", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>전체 해제</button>
          <button onClick={() => void onRunPreflight()} style={{ padding: "7px 18px", background: "rgba(16,62,54,.12)", border: "1px solid rgba(16,62,54,.4)", borderRadius: 999, color: "#103E36", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>RAW 매칭 확인</button>
        </div>
      </div> : null}
    </div>
  );
}
