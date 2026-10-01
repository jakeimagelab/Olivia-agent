"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FolderOpen, Loader2, PencilLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { executeRenamePlan } from "@/lib/photoRename/executeRenamePlan";
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
  // 이름변경은 항상 현재 작업 폴더 안에서만 안전하게 처리한다. T컷에서 임시로
  // 고른 폴더를 이 화면의 대상 폴더로 전파하지 않는다.
  const transferMode: RenameTransferMode = "same-folder";
  const [renameMode, setRenameMode] = useState<RenameMode>("template");
  const [templateText, setTemplateText] = useState("");
  const [startNumber, setStartNumber] = useState(1);
  const [digits, setDigits] = useState(3);
  const [customText, setCustomText] = useState("");
  const [includeSubdirectories, setIncludeSubdirectories] = useState(true);
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
  }), [customText, digits, includeSubdirectories, renameMode, startNumber, templateText]);
  const running = phase === "previewing" || phase === "running";

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

  const preview = async () => {
    if (!rootDir) {
      setMessage("사진 작업실에서 먼저 작업 폴더를 선택해주세요.");
      setPhase("failed");
      return;
    }
    setPhase("previewing");
    setMessage("");
    try {
      const nextPlan = await buildRenamePlan({ root: rootDir, destination: null, settings });
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
    const confirmed = window.confirm(`${plan.readyCount.toLocaleString("ko-KR")}개 파일의 이름을 같은 폴더에서 변경합니다.\n\n원본을 직접 바꾸지 않고 복사 → size·SHA-256 검증 → 전체 검증 성공 후 기존 이름을 정리하는 방식으로 처리합니다.\n\n계속하시겠습니까?`);
    if (!confirmed) return;

    setPhase("running");
    setMessage("");
    setProgress({ current: 0, total: plan.readyCount, name: "" });
    try {
      await ensureWritePermission(rootDir);
      const result = await executeRenamePlan(plan, transferMode, (current, total, name) => setProgress({ current, total, name }));
      setMessage(`${result.changedCount.toLocaleString("ko-KR")}개 파일 이름 변경 완료 · SHA-256 무결성 검사 성공`);
      setPhase("done");
    } catch (error) {
      setMessage(`${errorMessage(error)}\n원본 파일은 변경되지 않았습니다.`);
      setPhase("failed");
    }
  };

  const visibleRows = plan?.rows.slice(0, 16) ?? [];

  return (
    <section className={styles.surface} aria-label="사진 이름변경">
      <header className={styles.header}>
        <span className={styles.headerIcon}><PencilLine size={22} aria-hidden="true" /></span>
        <div><h2>이름변경</h2><p>원하는 규칙으로 사진 파일 이름을 일괄 변경합니다.</p></div>
        <span className={styles.folder}><FolderOpen size={14} aria-hidden="true" />현재 작업 폴더: <strong>{rootDir?.name ?? "선택 안 됨"}</strong></span>
      </header>

      <div className={styles.layout}>
        <div className={styles.controls}>
          {!rootDir ? <div className={styles.noFolderNotice}><FolderOpen size={16} /><span>사진 셀렉 또는 사진 분류에서 작업 폴더를 지정하면 미리보기와 이름 변경을 실행할 수 있습니다.</span></div> : null}
          <section className={styles.section}>
            <h3>1. 이름 변경 방식</h3>
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
            <h3>2. 추가 옵션</h3>
            <label><input type="checkbox" checked={includeSubdirectories} onChange={(event) => { setIncludeSubdirectories(event.target.checked); invalidate(); }} disabled={running} />하위 폴더까지 모두 처리 <small>각 사진은 언제나 자신의 직속 부모 폴더명을 사용합니다.</small></label>
          </section>
        </div>

        <aside className={styles.preview}>
          <div className={styles.previewHeading}><h3>3. 변경 미리보기</h3><span>총 {plan?.discoveredCount ?? 0}개 파일</span></div>
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
        <span>{!rootDir ? "작업 폴더를 지정하면 파일 미리보기를 시작할 수 있습니다." : plan ? `${plan.discoveredCount.toLocaleString("ko-KR")}개 파일을 확인했습니다.` : "미리보기로 변경 대상과 중복을 확인하세요."}</span>
        <div><button type="button" className={styles.secondary} onClick={preview} disabled={!rootDir || running}>{phase === "previewing" ? "미리보기 중…" : "미리보기"}</button><button type="button" className={styles.primary} onClick={execute} disabled={!rootDir || !plan || plan.blocked || plan.readyCount === 0 || running}>{phase === "running" ? "이름 변경 중…" : `이름 변경 (${plan?.readyCount ?? 0}개)`}</button></div>
      </footer>
    </section>
  );
}
