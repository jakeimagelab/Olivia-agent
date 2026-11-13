"use client";

import type { ReactNode } from "react";
import { FolderOpen, MessageSquare, Upload } from "lucide-react";

import { parseNamesFromFiles, parseNamesFromText } from "@/lib/selectMatch/nameParsing";
import { C } from "@/lib/theme";
import { SelectMatchButton, type SelectMatchControlColors } from "./SelectMatchControls";
import type { SelectMatchClientInputController } from "./useSelectMatchClientInput";

export function SelectMatchEntryView({
  featureTabs,
  embedded,
  initialView,
  selectionOnly,
  hasFileSystemAccess,
  onLoadFolder,
  controller,
  colors,
}: {
  featureTabs: ReactNode;
  embedded: boolean;
  initialView: "raw" | "manual" | "client";
  selectionOnly: boolean;
  hasFileSystemAccess: boolean;
  onLoadFolder: () => void | Promise<void>;
  controller: SelectMatchClientInputController;
  colors: SelectMatchControlColors;
}) {
  const {
    inputMode,
    setInputMode,
    clientText,
    setClientText,
    clientDragging,
    setClientDragging,
    clientFileRef,
    uploadedClientFiles,
    uploadOcrLoading,
    uploadOcrNames,
    selectedUploadOcrNames,
    setSelectedUploadOcrNames,
    uploadOcrMessage,
    confirmClientInput,
    setUploadedFiles,
    analyzeUploadedFileNames,
  } = controller;
  const entryModes = ([
    { key: "folder", icon: <FolderOpen size={15} strokeWidth={2} aria-hidden="true" />, title: "폴더 직접 선택", desc: "JPG 폴더를 열어서\n시각적으로 베스트컷 선택" },
    { key: "text", icon: <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />, title: "텍스트 붙여넣기", desc: "카카오톡·메모 등\n파일명 목록을 붙여넣기" },
    { key: "upload", icon: <Upload size={15} strokeWidth={2} aria-hidden="true" />, title: "파일 업로드", desc: "고객이 보낸 JPG 파일을\n직접 드래그 & 드롭" },
  ] as const).filter((item) => initialView === "raw" || (initialView === "manual" ? item.key === "folder" : item.key !== "folder"));

  return (
    <div style={{ maxWidth: 660, margin: embedded ? "0 auto" : "32px auto", padding: embedded ? "24px 20px 28px" : "0 20px" }}>
      {featureTabs}
      {!embedded ? <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 30, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: colors.uiAccent }}>RAW 매칭</div>
        <div style={{ fontSize: 12, color: colors.uiMuted, marginTop: 4 }}>고객 선택 정보를 어떻게 받으셨나요?</div>
      </div> : null}

      {initialView !== "manual" ? <div style={{ display: "grid", gridTemplateColumns: `repeat(${entryModes.length}, minmax(0, 1fr))`, gap: 10, marginBottom: 20 }}>
        {entryModes.map((mode) => <button
          type="button"
          key={mode.key}
          onClick={() => setInputMode(mode.key)}
          aria-pressed={inputMode === mode.key}
          style={{
            background: inputMode === mode.key ? (embedded ? "rgba(48,174,146,.14)" : colors.groupedSurface) : colors.surfaceCard,
            border: `1.5px solid ${inputMode === mode.key ? colors.uiAccent : colors.uiBorder}`,
            borderRadius: 12,
            padding: "18px 14px",
            textAlign: "center",
            cursor: "pointer",
            transition: "background .2s cubic-bezier(.32,.72,0,1), border-color .2s cubic-bezier(.32,.72,0,1)",
            fontFamily: "inherit",
          }}
        >
          <div style={{ minHeight: 22, display: "grid", placeItems: "center", marginBottom: 8, color: inputMode === mode.key ? colors.uiAccent : colors.uiMuted }}>{mode.icon}</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: inputMode === mode.key ? colors.uiAccent : colors.uiText, marginBottom: 4 }}>{mode.title}</div>
          <div style={{ fontSize: 10, color: colors.uiHint, lineHeight: 1.6, whiteSpace: "pre-line" }}>{mode.desc}</div>
        </button>)}
      </div> : null}

      {inputMode === "folder" ? <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 12, color: colors.uiMuted, lineHeight: 1.8, marginBottom: 18, textAlign: "center" }}>
          분류된 JPG 폴더를 선택하면 폴더 이름과 관계없이<br />하위 사진을 찾아 그룹별로 베스트컷을 선택할 수 있습니다.
        </div>
        {!hasFileSystemAccess ? <div style={{ fontSize: 12, color: C.red, textAlign: "center" }}>Chrome 또는 Edge를 사용해주세요.</div> : (
          <div style={{ textAlign: "center" }}><SelectMatchButton dark={embedded} onClick={() => void onLoadFolder()}><FolderOpen size={16} aria-hidden="true" />폴더 선택</SelectMatchButton></div>
        )}
        <div style={{ marginTop: 16, background: colors.groupedSurface, borderRadius: 8, padding: "12px 14px", fontSize: 11, color: colors.uiMuted, lineHeight: 1.9 }}>
          {selectionOnly ? <>
            JPG 또는 분류된 사진 폴더를 선택하세요.<br />선택 결과는 사진 작업실의 JPG 선택 목록에만 저장됩니다.
          </> : <>
            촬영폴더/<br />
            &nbsp;&nbsp;├ <strong>JPG/분류폴더들/</strong> ← JPG 또는 촬영폴더 선택<br />
            &nbsp;&nbsp;├ <strong>RAW/</strong> — 전체 RAW<br />
            &nbsp;&nbsp;└ <strong>Selected_RAW/</strong> — 결과물 자동 생성
          </>}
        </div>
      </div> : null}

      {inputMode === "text" ? <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 12, color: colors.uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
          카카오톡 대화, 이메일, 메모 등에서 파일명이 담긴 텍스트를 그대로 붙여넣으세요.<br />
          <span style={{ color: colors.uiHint }}>DSC_0142.jpg 형태의 파일명을 자동 추출합니다.</span>
        </div>
        <textarea
          value={clientText}
          onChange={(event) => setClientText(event.target.value)}
          placeholder={"예시:\nDSC_0142.jpg, DSC_0145.jpg\nDSC_0148.jpg\nDSC_0151.jpg ..."}
          rows={7}
          style={{ width: "100%", border: `1px solid ${colors.uiBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 12, fontFamily: "monospace", resize: "vertical", background: colors.inputSurface, color: colors.uiText, boxSizing: "border-box" }}
        />
        {clientText.trim() ? (() => {
          const names = parseNamesFromText(clientText);
          return <div style={{ marginTop: 10, background: colors.groupedSurface, borderRadius: 8, padding: "10px 14px", fontSize: 11, color: colors.uiMuted }}>
            파일명 <strong style={{ color: colors.uiAccent }}>{names.size}개</strong> 추출됨
            {names.size > 0 ? <span style={{ marginLeft: 8, color: colors.uiHint }}>{Array.from(names).slice(0, 3).join(", ")}{names.size > 3 ? ` 외 ${names.size - 3}개` : ""}</span> : null}
          </div>;
        })() : null}
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <SelectMatchButton dark={embedded} onClick={() => confirmClientInput(parseNamesFromText(clientText))} disabled={!clientText.trim()}>
            {selectionOnly ? "선택 목록 저장" : "다음 — RAW 폴더 선택"}
          </SelectMatchButton>
        </div>
      </div> : null}

      {inputMode === "upload" ? <div style={{ background: colors.surfaceCard, border: `1px solid ${colors.uiBorder}`, borderRadius: 14, padding: 24 }}>
        <div style={{ fontSize: 12, color: colors.uiMuted, lineHeight: 1.7, marginBottom: 14 }}>
          고객이 선택해서 보낸 JPG 파일 또는 셀렉 리포트 스크린샷을 아래 영역에 드래그하거나 클릭해서 선택하세요.<br />
          <span style={{ color: colors.uiHint }}>일반 JPG는 파일명 그대로, 리포트 이미지는 화면 안의 파일명을 분석해 RAW 매칭에 사용합니다.</span>
        </div>
        <input ref={clientFileRef} type="file" multiple accept="image/*,.jpg,.jpeg,.heic,.png,.tif" style={{ display: "none" }} onChange={(event) => { if (event.target.files) setUploadedFiles(event.target.files); }} />
        <div
          onDragOver={(event) => { event.preventDefault(); setClientDragging(true); }}
          onDragLeave={() => setClientDragging(false)}
          onDrop={(event) => { event.preventDefault(); setClientDragging(false); setUploadedFiles(event.dataTransfer.files); }}
          onClick={() => clientFileRef.current?.click()}
          style={{ border: `2px dashed ${clientDragging ? colors.uiAccent : colors.uiBorder}`, borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: clientDragging ? colors.groupedSurface : colors.inputSurface, transition: "all .2s" }}
        >
          <FolderOpen size={32} aria-hidden="true" style={{ marginBottom: 10, color: colors.uiAccent }} />
          <div style={{ fontSize: 13, fontWeight: 500, color: colors.uiAccent, marginBottom: 4 }}>파일을 드래그하거나 클릭</div>
          <div style={{ fontSize: 11, color: colors.uiHint }}>선택 후 파일명 그대로 사용하거나 이미지 안 파일명을 분석할 수 있습니다.</div>
        </div>
        {uploadedClientFiles.length > 0 ? <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, background: colors.inputSurface }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: colors.uiAccent }}>업로드한 파일 {uploadedClientFiles.length}개</div>
          <div style={{ marginTop: 5, maxHeight: 52, overflowY: "auto", fontSize: 10, color: colors.uiMuted, lineHeight: 1.65 }}>{uploadedClientFiles.map((file) => file.name).join(", ")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <SelectMatchButton dark={embedded} variant="secondary" onClick={() => confirmClientInput(parseNamesFromFiles(uploadedClientFiles))}>파일명 그대로 사용</SelectMatchButton>
            <SelectMatchButton dark={embedded} variant="secondary" disabled={uploadOcrLoading} onClick={() => void analyzeUploadedFileNames()}>{uploadOcrLoading ? "🔎 이미지 분석 중..." : "🔎 이미지 속 파일명 분석"}</SelectMatchButton>
          </div>
        </div> : null}
        {uploadOcrMessage ? <div style={{ marginTop: 12, borderRadius: 9, padding: "10px 12px", fontSize: 11, fontWeight: 500, color: uploadOcrMessage.ok ? (embedded ? "#A8F1DC" : C.green) : C.red, background: uploadOcrMessage.ok ? colors.groupedSurface : (embedded ? "rgba(232,93,44,.10)" : "#FEF2F2") }}>{uploadOcrMessage.text}</div> : null}
        {uploadOcrNames.length > 0 ? <div style={{ marginTop: 12, border: `1px solid ${colors.uiBorder}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 12px", background: colors.groupedSurface, color: colors.uiAccent, fontSize: 11, fontWeight: 500 }}>
            <span>인식된 파일명 {uploadOcrNames.length}개</span><span>{selectedUploadOcrNames.size}개 선택</span>
          </div>
          <div style={{ maxHeight: 162, overflowY: "auto", padding: "7px 12px" }}>
            {uploadOcrNames.map((name) => {
              const checked = selectedUploadOcrNames.has(name);
              return <label key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", color: colors.uiText, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5 }}>
                <input type="checkbox" checked={checked} onChange={() => setSelectedUploadOcrNames((current) => {
                  const next = new Set(current);
                  if (next.has(name)) next.delete(name);
                  else next.add(name);
                  return next;
                })} />
                {name}
              </label>;
            })}
          </div>
          <div style={{ padding: "0 12px 12px", textAlign: "right" }}>
            <SelectMatchButton dark={embedded} disabled={selectedUploadOcrNames.size === 0} onClick={() => confirmClientInput(new Set(selectedUploadOcrNames))}>
              {selectionOnly ? "선택한 인식 목록 저장" : `선택한 ${selectedUploadOcrNames.size}개로 RAW 매칭`}
            </SelectMatchButton>
          </div>
        </div> : null}
      </div> : null}
    </div>
  );
}
