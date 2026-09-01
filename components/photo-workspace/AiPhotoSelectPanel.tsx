"use client";

import { FolderOpen, Image as ImageIcon, MessageCircle, Search } from "lucide-react";
import { useState } from "react";
import styles from "./PhotoWorkspace.module.css";

export type AiPhotoSelectCallbacks = {
  onSelectFolder?: (folder: FileSystemDirectoryHandle) => void;
  onSearch?: (query: string, folder?: FileSystemDirectoryHandle) => void;
  onSelectCandidate?: (candidateId: string) => void;
  onConfirmSelection?: (candidateIds: string[]) => void;
  onStartRawMatch?: (candidateIds: string[]) => void;
};

export default function AiPhotoSelectPanel(callbacks: AiPhotoSelectCallbacks) {
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const selectedIds: string[] = [];

  const selectFolder = async () => {
    try {
      const handle = await (window as typeof window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker?.({ mode: "read" });
      if (!handle) {
        setNotice("Chrome 또는 Edge에서 사진 폴더를 선택할 수 있습니다.");
        return;
      }
      setFolder(handle);
      setNotice("");
      callbacks.onSelectFolder?.(handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("사진 폴더를 선택하지 못했습니다.");
    }
  };

  const search = () => {
    if (!query.trim() || !folder) return;
    callbacks.onSearch?.(query.trim(), folder);
    setNotice("AI 사진 검색 엔진은 다음 기능 단계에서 연결됩니다.");
  };

  return (
    <div className={styles.aiPanel}>
      <div className={styles.aiIntro}>
        <p>자연어로 원하는 사진을 설명하면 AI가 관련 사진을 찾아드립니다.</p>
        <div className={styles.searchRow}>
          <label className={styles.searchInput}>
            <MessageCircle size={17} aria-hidden="true" />
            <span className="sr-only">원하는 사진 설명</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") search(); }} placeholder="예) 상받는 사진 골라줘, 상담하는 장면 찾아줘, 발표하는 사진 셀렉해줘" />
          </label>
          <button type="button" className={styles.primaryButton} disabled={!query.trim() || !folder} onClick={search}><Search size={16} />찾기</button>
        </div>
        {notice ? <p className={styles.inlineNotice} role="status">{notice}</p> : null}
      </div>

      <section className={styles.aiSection}>
        <h3><span>1.</span> 사진 폴더 선택</h3>
        <div className={styles.folderRow}>
          <span className={styles.folderState}><FolderOpen size={19} aria-hidden="true" />{folder?.name || "폴더가 선택되지 않았습니다."}</span>
          <button type="button" className={styles.secondaryButton} onClick={selectFolder}>폴더 선택</button>
        </div>
      </section>

      <section className={styles.aiSection}>
        <div className={styles.sectionHeading}><h3><span>2.</span> 후보 사진</h3><small>{selectedIds.length}장 선택됨</small></div>
        <div className={styles.emptyState}>
          <ImageIcon size={46} strokeWidth={1.35} aria-hidden="true" />
          <p>사진 폴더를 선택하고 검색을 시작하세요.</p>
        </div>
      </section>

      <div className={styles.aiActions}>
        <button type="button" className={styles.secondaryButton} disabled={!selectedIds.length}>선택 초기화</button>
        <div><button type="button" className={styles.mutedButton} disabled={!selectedIds.length} onClick={() => callbacks.onConfirmSelection?.(selectedIds)}>선택 완료 ({selectedIds.length}장)</button><button type="button" className={styles.mutedButton} disabled={!selectedIds.length} onClick={() => callbacks.onStartRawMatch?.(selectedIds)}>RAW 매칭으로 이동</button></div>
      </div>
    </div>
  );
}
