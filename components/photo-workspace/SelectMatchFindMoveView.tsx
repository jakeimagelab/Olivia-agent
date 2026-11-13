"use client";

import type { ReactNode } from "react";
import { CheckCircle2, FileText, FolderOpen, ScanSearch } from "lucide-react";

import { parseFileNameQueries } from "@/lib/selectMatch/workspaceHelpers";
import { C } from "@/lib/theme";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";
import type { SelectMatchFindMoveController } from "./useSelectMatchFindMove";

export function SelectMatchFindMoveView({
  featureTabs,
  hasFileSystemAccess,
  workerOnline,
  controller,
  colors,
}: {
  featureTabs: ReactNode;
  hasFileSystemAccess: boolean;
  workerOnline: boolean | null;
  controller: SelectMatchFindMoveController;
  colors: SelectMatchControlColors;
}) {
  const {
    rootDir,
    text,
    setText,
    folderName,
    setFolderName,
    step,
    matches,
    missing,
    progress,
    movedCount,
    ocrLoading,
    ocrMessage,
    ocrFileRef,
    workerRootPath,
    setWorkerRootPath,
    moveError,
    pickFolder,
    extractNamesFromScreenshot,
    runFindByName,
    runMoveMatched,
    reset,
  } = controller;

  if (step === "idle") return (
    <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
      {featureTabs}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <FileText size={28} aria-hidden="true" style={{ marginBottom: 8, color: colors.uiAccent }} />
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.uiAccent }}>파일명으로 찾기</div>
        <div style={{ fontSize: 12, color: colors.uiMuted, marginTop: 4 }}>파일명 목록을 붙여넣으면 폴더에서 찾아 선택 폴더로 이동합니다.</div>
      </div>
      <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiText, marginBottom: 8 }}>1. 검색할 폴더 선택 (하위 폴더까지 검색)</div>
          {!hasFileSystemAccess ? (
            <div style={{ fontSize: 12, color: C.red }}>Chrome 또는 Edge를 사용해주세요.</div>
          ) : (
            <SelectMatchButton onClick={pickFolder}>{rootDir ? <><CheckCircle2 size={16} aria-hidden="true" />{rootDir.name}</> : <><FolderOpen size={16} aria-hidden="true" />폴더 선택</>}</SelectMatchButton>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiText, marginBottom: 8 }}>2. 파일명 목록 (한 줄에 하나씩, 또는 쉼표로 구분)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <input
              ref={ocrFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => { void extractNamesFromScreenshot(event.currentTarget.files?.[0] ?? null); }}
            />
            <SelectMatchButton variant="secondary" disabled={ocrLoading} onClick={() => ocrFileRef.current?.click()} style={{ padding: "8px 13px" }}>
              {ocrLoading ? "이미지 읽는 중..." : <><ScanSearch size={15} aria-hidden="true" />스크린샷에서 파일명 추출</>}
            </SelectMatchButton>
            <span style={{ fontSize: 11, color: colors.uiHint }}>확장자를 제거하고 쉼표로 구분한 한 줄로 자동 입력합니다.</span>
          </div>
          {ocrMessage ? (
            <div style={{
              marginBottom: 10, borderRadius: 8, padding: "9px 12px", fontSize: 11, fontWeight: 500,
              color: ocrMessage.ok ? C.green : C.red,
              background: ocrMessage.ok ? colors.groupedSurface : "#FEF2F2",
            }}>
              {ocrMessage.text}
            </div>
          ) : null}
          <textarea
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            placeholder={"예시:\nDSC_0142.jpg\nDSC_0145.mp4\nDSC_0148  ← 확장자 생략 시 모든 확장자 파일을 찾습니다"}
            rows={7}
            style={{ width: "100%", border: `1px solid ${colors.uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: colors.inputSurface, color: colors.uiText, boxSizing: "border-box" }}
          />
          {text.trim() ? (
            <div style={{ marginTop: 10, background: colors.groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: colors.uiMuted }}>
              파일명 <strong style={{ color: colors.uiAccent }}>{parseFileNameQueries(text).length}개</strong> 입력됨
            </div>
          ) : null}
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiText, marginBottom: 8 }}>3. 이동할 선택 폴더 이름</div>
          <input
            value={folderName}
            onChange={(event) => setFolderName(event.currentTarget.value || "선택")}
            style={{ width: "100%", border: `1px solid ${colors.uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: colors.uiHint, marginTop: 6 }}>선택한 폴더 안에 이 이름으로 폴더가 생성되고, 찾은 파일이 그 안으로 이동합니다.</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <SelectMatchButton onClick={runFindByName} disabled={!rootDir || !text.trim()}>폴더에서 찾기</SelectMatchButton>
        </div>
      </div>
    </div>
  );

  if (step === "scanning") return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <ScanSearch size={28} aria-hidden="true" style={{ marginBottom: 12, color: colors.uiAccent }} />
      <div style={{ fontSize: 13, color: colors.uiMuted }}>폴더를 검색하는 중입니다...</div>
    </div>
  );

  if (step === "result") return (
    <div style={{ maxWidth: 660, margin: "32px auto", padding: "0 20px" }}>
      <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${colors.uiBorder}`, fontSize: 13, fontWeight: 600, color: colors.uiAccent }}>
          검색 결과 — 찾음 {matches.length}개 · 못 찾음 {missing.length}개
        </div>
        <div style={{ padding: 20 }}>
          {matches.length > 0 ? (
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: missing.length > 0 ? 14 : 0 }}>
              {matches.map((match) => (
                <div key={match.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: colors.uiText, borderBottom: `1px solid ${colors.uiBorder}` }}>
                  <span>{match.name}</span>
                  <span style={{ color: colors.uiHint }}>{match.query}</span>
                </div>
              ))}
            </div>
          ) : null}
          {missing.length > 0 ? <div style={{ background: "#FEF2F2", borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.red }}>⚠️ 못 찾은 파일명 {missing.length}개: {missing.join(", ")}</div> : null}
        </div>
      </div>
      <div style={{ marginBottom: 14, padding: "12px 14px", border: `1px solid ${colors.uiBorder}`, borderRadius: 10, background: colors.groupedSurface }}>
        <label style={{ display: "grid", gap: 6, color: colors.uiText, fontSize: 11, fontWeight: 600 }}>
          Mac Studio에서 보이는 기준 폴더 경로
          <input
            value={workerRootPath}
            onChange={(event) => setWorkerRootPath(event.currentTarget.value)}
            placeholder="/Volumes/Agentstation/촬영폴더"
            style={{ minHeight: 42, border: `1px solid ${colors.uiBorder}`, borderRadius: 8, background: colors.inputSurface, color: colors.uiText, padding: "0 10px", font: "inherit", fontSize: 11 }}
          />
        </label>
        <p style={{ margin: "7px 0 0", color: colors.uiHint, fontSize: 10, lineHeight: 1.5 }}>자동 경로가 다르면 Mac Studio Finder에서 보이는 절대경로로 고쳐 주세요. 실제 이동은 Mac Studio가 원본 속성을 보존해 처리합니다.</p>
      </div>
      {moveError ? <div role="alert" style={{ marginBottom: 12, borderRadius: 8, padding: "10px 12px", background: "#FEF2F2", color: C.red, fontSize: 11 }}>{moveError}</div> : null}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <SelectMatchButton variant="secondary" onClick={reset}>← 다시 검색</SelectMatchButton>
        <SelectMatchButton onClick={runMoveMatched} disabled={matches.length === 0 || workerOnline !== true || !workerRootPath.trim()}>{folderName}/ 폴더로 이동</SelectMatchButton>
      </div>
    </div>
  );

  if (step === "moving") {
    const percent = progress.total > 0 ? Math.round((progress.cur / progress.total) * 100) : 0;
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px" }}>
        <div style={{ fontSize: 13, color: colors.uiMuted, marginBottom: 8, textAlign: "center" }}>{progress.cur} / {progress.total} 이동 중...</div>
        <div style={{ height: 8, background: colors.uiBorder, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${percent}%`, background: colors.uiAccent, transition: "width .2s" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
      <CheckCircle2 size={28} aria-hidden="true" style={{ marginBottom: 12, color: C.green }} />
      <div style={{ fontSize: 14, fontWeight: 500, color: colors.uiText, marginBottom: 20 }}>
        {movedCount}개 파일을 <strong style={{ color: colors.uiAccent }}>{folderName}/</strong> 폴더로 이동했습니다.
      </div>
      <SelectMatchButton onClick={reset}>새로 검색하기</SelectMatchButton>
    </div>
  );
}
