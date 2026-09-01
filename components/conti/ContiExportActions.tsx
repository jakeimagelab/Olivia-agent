"use client";

import { CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, Link2, RotateCcw } from "lucide-react";

type Props = {
  saveLoading: boolean;
  autoSaveState: "idle" | "saving" | "saved" | "error";
  shareLoading: boolean;
  shareCopied: boolean;
  generatingImages: boolean;
  downloadMenuOpen: boolean;
  completeState: "idle" | "completing" | "done" | "error";
  completeError: string;
  onReset: () => void;
  onFieldView: () => void;
  onShare: () => void;
  onGenerateImages: () => void;
  onSave: () => void;
  onToggleDownloadMenu: () => void;
  onPDF: () => void;
  onExcel: () => void;
  onCompleteWorkflow: () => void;
};

const secondary = { display: "inline-flex", alignItems: "center", gap: 7, padding: "0 14px", minHeight: 40, border: "1px solid rgba(21,88,85,.25)", borderRadius: 8, background: "#fff", color: "#155855", fontWeight: 800, fontSize: 13, cursor: "pointer" } as const;

export default function ContiExportActions({ saveLoading, autoSaveState, shareLoading, shareCopied, generatingImages, downloadMenuOpen, completeState, completeError, onReset, onFieldView, onShare, onGenerateImages, onSave, onToggleDownloadMenu, onPDF, onExcel, onCompleteWorkflow }: Props) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
    <button type="button" onClick={onReset} style={secondary}><RotateCcw size={15} /> 다시 입력</button>
    <button type="button" onClick={onFieldView} style={secondary}>📋 현장 뷰</button>
    <button type="button" onClick={onShare} disabled={shareLoading} style={{ ...secondary, opacity: shareLoading ? .7 : 1 }}><Link2 size={15} />{shareLoading ? "링크 생성 중..." : shareCopied ? "복사됨!" : "현장뷰 공유"}</button>
    <button type="button" onClick={onGenerateImages} disabled={generatingImages} style={{ ...secondary, opacity: generatingImages ? .7 : 1 }}>{generatingImages ? "⟳ 이미지 생성 중..." : "씬 이미지 생성"}</button>
    <button type="button" onClick={onSave} disabled={saveLoading} style={{ ...secondary, opacity: saveLoading ? .7 : 1 }}><FileText size={15} />{saveLoading ? "저장 중..." : "저장하기"}</button>
    <span style={{ ...secondary, cursor: "default", color: autoSaveState === "error" ? "#dc2626" : "#5A7470", fontSize: 11 }}>{autoSaveState === "saving" ? "저장 중..." : autoSaveState === "saved" ? "자동 저장됨" : autoSaveState === "error" ? "저장 실패" : "⌘S · ⌘Z · ⇧⌘Z"}</span>
    <div style={{ position: "relative" }}><button type="button" onClick={onToggleDownloadMenu} className="admin-primary-button"><Download size={15} /> 다운로드 <ChevronDown size={13} /></button>{downloadMenuOpen ? <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 30, minWidth: 140, overflow: "hidden", background: "#fff", border: "1px solid rgba(21,88,85,.14)", borderRadius: 10, boxShadow: "0 12px 30px rgba(21,88,85,.14)" }}><button type="button" onClick={onPDF} style={{ ...secondary, width: "100%", border: 0, borderRadius: 0 }}><Download size={14} /> PDF</button><button type="button" onClick={onExcel} style={{ ...secondary, width: "100%", border: 0, borderTop: "1px solid rgba(21,88,85,.08)", borderRadius: 0 }}><FileSpreadsheet size={14} /> Excel</button></div> : null}</div>
    <button type="button" onClick={onCompleteWorkflow} disabled={completeState === "completing"} title={completeState === "error" ? completeError : undefined} style={{ ...secondary, background: completeState === "error" ? "#fff" : "#155855", color: completeState === "error" ? "#c9581a" : "#fff", opacity: completeState === "completing" ? .7 : 1 }}><CheckCircle2 size={15} />{completeState === "completing" ? "최종완료 처리 중..." : completeState === "done" ? "✓ 최종완료됨" : completeState === "error" ? "✕ 완료 실패" : "최종완료"}</button>
  </div>;
}
