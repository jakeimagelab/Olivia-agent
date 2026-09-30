"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, FolderOpen, FolderOutput, Loader2, PencilLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { executeRenamePlan } from "@/lib/photoRename/executeRenamePlan";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import {
  buildRenamePlan,
  type RenamePlan,
  type RenamePreviewStatus,
  type RenameSettings,
  type RenameTransferMode,
} from "@/lib/photoRename/renamePlan";
import type { RenameMode } from "@/lib/photoRename/naming";
import styles from "./PhotoRenameWorkspace.module.css";

type Phase = "idle" | "previewing" | "ready" | "running" | "done" | "failed";

const STATUS_LABEL: Record<RenamePreviewStatus, string> = {
  READY: "변경",
  SKIP: "건너뜀",
  DUPLICATE: "중복",
  ERROR: "오류",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}

async function ensureWritePermission(directory: FileSystemDirectoryHandle): Promise<void> {
  const handle = directory as any;
  if (typeof handle.queryPermission !== "function") return;
  let permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted" && typeof handle.requestPermission === "function") {
    permission = await handle.requestPermission({ mode: "readwrite" });
  }
  if (permission !== "granted") throw new Error(`${directory.name} 폴더의 읽기·쓰기 권한이 필요합니다.`);
}

function ModeCard({
  active,
  title,
  description,
  icon,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${styles.modeCard} ${active ? styles.modeCardActive : ""}`} onClick={onClick}>
      <span className={styles.modeIcon}>{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
    </button>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ready" | "skip" | "danger" }) {
  return <div className={`${styles.stat} ${styles[`stat${tone[0].toUpperCase()}${tone.slice(1)}`]}`}><small>{label}</small><strong>{value.toLocaleString("ko-KR")}</strong></div>;
}

export default function PhotoRenameWorkspace({ rootDir }: { rootDir: FileSystemDirectoryHandle | null }) {
  const { setCurrentLocalFolder } = usePhotoStudioExecution();
  const [transferMode, setTransferMode] = useState<RenameTransferMode>("same-folder");
  const [renameMode, setRenameMode] = useState<RenameMode>("template");
  const [templateText, setTemplateText] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(3);
  const [customText, setCustomText] = useState("");
  const [includeSubdirectories, setIncludeSubdirectories] = useState(true);
  const [destination, setDestination] = useState<FileSystemDirectoryHandle | null>(null);
  const [plan, setPlan] = useState<RenamePlan | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0, name: "" });

  const settings = useMemo<RenameSettings>(() => ({
    mode: renameMode,
    template: { text: templateText, startNumber, digits },
    customText,
    includeSubdirectories,
    transferMode,
  }), [customText, digits, includeSubdirectories, renameMode, startNumber, templateText, transferMode]);
  const running = phase === "previewing" || phase === "running";
  const needDestination = transferMode !== "same-folder";

  const invalidate = () => {
    if (running) return;
    setPlan(null);
    setMessage("");
    setPhase("idle");
  };

  useEffect(() => {
    setPlan(null);
    setMessage("");
    setPhase("idle");
  }, [rootDir]);

  const chooseDestination = async () => {
    try {
      const picker = (window as typeof window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) throw new Error("Chrome 또는 Edge에서 목적지 폴더를 선택할 수 있습니다.");
      const next = await picker({ mode: "readwrite" });
      setDestination(next);
      invalidate();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(errorMessage(error));
      setPhase("failed");
    }
  };

  const chooseSource = async () => {
    try {
      const picker = (window as typeof window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) throw new Error("Chrome 또는 Edge에서 작업 폴더를 선택할 수 있습니다.");
      const next = await picker({ mode: "readwrite" });
      setCurrentLocalFolder(next);
      setMessage("");
      setPhase("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(errorMessage(error));
      setPhase("failed");
    }
  };

  const preview = async () => {
    if (!rootDir) {
      setMessage("사진 작업실에서 먼저 작업 폴더를 선택해주세요.");
      setPhase("failed");
      return;
    }
    if (needDestination && !destination) {
      setMessage("이동 또는 복사 방식에서는 목적지 폴더를 선택해주세요.");
      setPhase("failed");
      return;
    }
    setPhase("previewing");
    setMessage("");
    try {
      const nextPlan = await buildRenamePlan({ root: rootDir, destination, settings });
      setPlan(nextPlan);
      setPhase("ready");
      if (nextPlan.blocked) setMessage("중복 또는 오류가 있어 실행할 수 없습니다. 목록을 확인해주세요.");
    } catch (error) {
      setPlan(null);
      setMessage(errorMessage(error));
      setPhase("failed");
    }
  };

  const execute = async () => {
    if (!rootDir || !plan || plan.blocked || running) return;
    const modeDescription = transferMode === "same-folder" ? "같은 폴더에서" : transferMode === "move" ? "목적지로 이동하면서" : "목적지에 복사하면서";
    const confirmed = window.confirm(`${plan.readyCount.toLocaleString("ko-KR")}개 파일의 이름을 ${modeDescription} 변경합니다.\n\n원본을 직접 바꾸지 않고 복사 → size·SHA-256 검증 → 전체 검증 성공 후 원본 정리 방식으로 처리합니다.\n\n계속하시겠습니까?`);
    if (!confirmed) return;

    setPhase("running");
    setMessage("");
    setProgress({ current: 0, total: plan.readyCount, name: "" });
    try {
      await ensureWritePermission(rootDir);
      if (destination) await ensureWritePermission(destination);
      const result = await executeRenamePlan(plan, transferMode, (current, total, name) => setProgress({ current, total, name }));
      setMessage(`${result.changedCount.toLocaleString("ko-KR")}개 파일 이름 변경 완료 · SHA-256 무결성 검사 성공`);
      setPhase("done");
    } catch (error) {
      setMessage(`${errorMessage(error)}\n원본 파일은 변경되지 않았습니다.`);
      setPhase("failed");
    }
  };

  const visibleRows = plan?.rows.slice(0, 16) ?? [];

  if (!rootDir) {
    return (
      <section className={styles.empty}>
        <FolderOpen size={28} aria-hidden="true" />
        <strong>현재 작업 폴더가 없습니다.</strong>
        <p>사진 작업실의 다른 작업에서 선택한 폴더를 그대로 사용하거나, 여기서 바로 시작할 수 있습니다.</p>
        <button type="button" className={styles.emptyAction} onClick={chooseSource}>폴더 선택</button>
      </section>
    );
  }

  return (
    <section className={styles.surface} aria-label="사진 이름변경">
      <header className={styles.header}>
        <span className={styles.headerIcon}><PencilLine size={22} aria-hidden="true" /></span>
        <div><h2>이름변경</h2><p>원하는 규칙으로 사진 파일 이름을 일괄 변경합니다.</p></div>
        <span className={styles.folder}><FolderOpen size={14} aria-hidden="true" />현재 작업 폴더: <strong>{rootDir.name}</strong></span>
      </header>

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section className={styles.section}>
            <h3>1. 처리 방식</h3>
            <div className={styles.cardGrid}>
              <ModeCard active={transferMode === "same-folder"} title="같은 폴더에서 이름 변경" description="검증 뒤 기존 파일명을 정리합니다." icon={<FolderOpen size={17} />} onClick={() => { setTransferMode("same-folder"); invalidate(); }} />
              <ModeCard active={transferMode === "move"} title="다른 폴더로 이동하면서 이름 변경" description="검증 뒤 원본 파일을 정리합니다." icon={<FolderOutput size={17} />} onClick={() => { setTransferMode("move"); invalidate(); }} />
              <ModeCard active={transferMode === "copy"} title="다른 폴더로 복사하면서 이름 변경" description="원본 파일은 그대로 유지합니다." icon={<Copy size={17} />} onClick={() => { setTransferMode("copy"); invalidate(); }} />
            </div>
            {needDestination ? <div className={styles.destination}><span><FolderOutput size={16} />{destination?.name ?? "목적지 폴더를 선택해주세요."}</span><button type="button" onClick={chooseDestination} disabled={running}>{destination ? "폴더 변경" : "목적지 선택"}</button></div> : null}
          </section>

          <section className={styles.section}>
            <h3>2. 이름 변경 방식</h3>
            <div className={styles.cardGrid}>
              <ModeCard active={renameMode === "template"} title="일반 이름 변경" description="Lightroom / Bridge 방식" icon={<PencilLine size={17} />} onClick={() => { setRenameMode("template"); invalidate(); }} />
              <ModeCard active={renameMode === "parent-prefix"} title="상위 폴더명 붙이기" description="직속 폴더명_기존파일명" icon={<FolderOpen size={17} />} onClick={() => { setRenameMode("parent-prefix"); invalidate(); }} />
              <ModeCard active={renameMode === "custom-prefix"} title="직접 텍스트 붙이기" description="텍스트_기존파일명" icon={<PencilLine size={17} />} onClick={() => { setRenameMode("custom-prefix"); invalidate(); }} />
            </div>

            {renameMode === "template" ? (
              <div className={styles.fields}>
                <label>텍스트<input value={templateText} onChange={(event) => { setTemplateText(event.target.value); invalidate(); }} disabled={running} /></label>
                <label>시작 번호<input type="number" min={0} value={startNumber} onChange={(event) => { setStartNumber(Number(event.target.value)); invalidate(); }} disabled={running} /></label>
                <label>번호 자릿수<select value={digits} onChange={(event) => { setDigits(Number(event.target.value)); invalidate(); }} disabled={running}>{[1, 2, 3, 4, 5].map((digit) => <option key={digit} value={digit}>{digit}자리</option>)}</select></label>
              </div>
            ) : null}
            {renameMode === "parent-prefix" ? <p className={styles.rule}><FolderOpen size={15} />각 사진이 들어 있는 바로 위 직속 부모 폴더명을 사용합니다. 이미 같은 접두사가 있으면 건너뜁니다.</p> : null}
            {renameMode === "custom-prefix" ? <label className={styles.customField}>파일명 앞에 붙일 텍스트<input value={customText} onChange={(event) => { setCustomText(event.target.value); invalidate(); }} placeholder="예: 서공예_증명" disabled={running} /></label> : null}
          </section>

          <section className={styles.optionRow}>
            <h3>3. 추가 옵션</h3>
            <label><input type="checkbox" checked={includeSubdirectories} onChange={(event) => { setIncludeSubdirectories(event.target.checked); invalidate(); }} disabled={running} />하위 폴더까지 모두 처리 <small>각 사진은 언제나 자신의 직속 부모 폴더명을 사용합니다.</small></label>
          </section>
        </div>

        <aside className={styles.preview}>
          <div className={styles.previewHeading}><h3>4. 변경 미리보기</h3><span>총 {plan?.discoveredCount ?? 0}개 파일</span></div>
          <div className={styles.stats}>
            <Stat label="변경 예정" value={plan?.readyCount ?? 0} tone="ready" />
            <Stat label="건너뜀" value={plan?.skipCount ?? 0} tone="skip" />
            <Stat label="중복" value={plan?.duplicateCount ?? 0} tone="danger" />
            <Stat label="오류" value={plan?.errorCount ?? 0} tone="danger" />
          </div>
          <div className={styles.table}>
            <div className={styles.tableHead}><span>#</span><span>현재 파일명</span><span>변경될 파일명</span><span>상태</span></div>
            {visibleRows.length === 0 ? <div className={styles.noPreview}>미리보기를 누르면 전체 파일명을 먼저 확인합니다.</div> : visibleRows.map((row, index) => <div className={styles.tableRow} key={`${row.path}:${row.targetName}`}><span>{index + 1}</span><span title={row.path}>{row.name}</span><span title={row.targetName}>{row.targetName}</span><span className={`${styles.badge} ${styles[`badge${row.status[0]}${row.status.slice(1).toLowerCase()}`]}`}>{STATUS_LABEL[row.status]}</span></div>)}
            {plan && plan.rows.length > visibleRows.length ? <div className={styles.more}>… 외 {plan.rows.length - visibleRows.length}개 파일</div> : null}
          </div>
          {phase === "running" ? <div className={styles.progress}><Loader2 size={15} className="spin-icon" /><span>복사 및 무결성 검사 {progress.current} / {progress.total}</span><small>{progress.name}</small></div> : null}
          {message ? <div className={`${styles.message} ${phase === "failed" ? styles.messageError : phase === "done" ? styles.messageDone : ""}`}>{phase === "failed" ? <TriangleAlert size={16} /> : phase === "done" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}<span>{message}</span></div> : null}
        </aside>
      </div>

      <footer className={styles.actions}>
        <span>{plan ? `${plan.discoveredCount.toLocaleString("ko-KR")}개 파일을 확인했습니다.` : "미리보기로 변경 대상과 중복을 확인하세요."}</span>
        <div><button type="button" className={styles.secondary} onClick={preview} disabled={running}>{phase === "previewing" ? "미리보기 중…" : "미리보기"}</button><button type="button" className={styles.primary} onClick={execute} disabled={!plan || plan.blocked || plan.readyCount === 0 || running}>{phase === "running" ? "이름 변경 중…" : `이름 변경 (${plan?.readyCount ?? 0}개)`}</button></div>
      </footer>
    </section>
  );
}
