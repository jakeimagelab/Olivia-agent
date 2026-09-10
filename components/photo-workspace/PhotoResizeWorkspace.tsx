"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FolderOpen, Loader2, OctagonMinus, Square } from "lucide-react";
import {
  countSourcePhotos,
  listResultPhotos,
  resultFolderName,
  runPhotoResize,
  type PhotoResizeStats,
} from "@/lib/photoResize/resizePhotos";
import styles from "./PhotoWorkspace.module.css";

type Phase = "idle" | "counting" | "running" | "stopping" | "completed";
const PREVIEW_LIMIT = 24;

const RESOLUTIONS = [2000, 3000, 4000, 4500] as const;
const QUALITIES = [80, 90, 95, 100] as const;
const EMPTY_STATS: PhotoResizeStats = { completed: 0, skipped: 0, failed: 0, failures: [] };

function ChipRow({ label, hint, value, options, custom, onSelect, onCustom }: {
  label: string;
  hint?: string;
  value: number;
  options: readonly number[];
  custom?: boolean;
  onSelect: (value: number) => void;
  onCustom?: (value: number) => void;
}) {
  const isCustomActive = custom && !options.includes(value as (typeof options)[number]);
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", marginBottom: 9 }}>
        {label} {hint ? <em style={{ fontStyle: "normal", color: "rgba(255,255,255,.32)", marginLeft: 6 }}>{hint}</em> : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            style={{
              padding: "9px 16px", borderRadius: 9, fontSize: 13, cursor: "pointer",
              border: `1px solid ${value === option ? "#155855" : "rgba(255,255,255,.14)"}`,
              background: value === option ? "#155855" : "rgba(255,255,255,.04)",
              color: value === option ? "#fff" : "rgba(255,255,255,.7)",
              fontWeight: value === option ? 700 : 500,
            }}
          >
            {option}{label.startsWith("해상도") ? "px" : "%"}
          </button>
        ))}
        {onCustom ? (
          <label style={{
            display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, fontSize: 13,
            border: `1px solid ${isCustomActive ? "#155855" : "rgba(255,255,255,.14)"}`,
            background: isCustomActive ? "#155855" : "rgba(255,255,255,.04)",
            color: isCustomActive ? "#fff" : "rgba(255,255,255,.7)",
            whiteSpace: "nowrap",
          }}>
            직접 입력
            <input
              type="number" min={500} max={10000} placeholder="0000"
              onFocus={() => onCustom(value)}
              onChange={(event) => { const n = Number(event.target.value); if (n > 0) onCustom(n); }}
              style={{ width: 74, minWidth: 74, background: "transparent", border: "none", color: "inherit", font: "inherit", fontSize: 13, outline: "none" }}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: "ok" | "skip" | "fail" }) {
  const color = tone === "ok" ? "#fff" : tone === "skip" ? "#D9B36A" : "#E88A80";
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 11, padding: "16px 18px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em", color }}>{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

export default function PhotoResizeWorkspace() {
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [longEdge, setLongEdge] = useState<number>(4000);
  const [quality, setQuality] = useState<number>(95);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentPath, setCurrentPath] = useState("");
  const [stats, setStats] = useState<PhotoResizeStats>(EMPTY_STATS);
  const [total, setTotal] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [notice, setNotice] = useState("");
  const [errOpen, setErrOpen] = useState(false);
  const [preview, setPreview] = useState<{ path: string; url: string }[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const stopFlagRef = useRef(false);

  useEffect(() => () => { preview?.forEach((entry) => URL.revokeObjectURL(entry.url)); }, [preview]);

  const selectFolder = async () => {
    try {
      const picker = (window as typeof window & { showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      if (!picker) { setNotice("Chrome 또는 Edge에서 폴더를 선택할 수 있습니다."); return; }
      const handle = await picker({ mode: "readwrite" });
      setRootDir(handle);
      setNotice("");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice("폴더를 선택하지 못했습니다.");
    }
  };

  const start = async () => {
    if (!rootDir || phase === "running" || phase === "counting") return;
    stopFlagRef.current = false;
    setStopped(false);
    setStats(EMPTY_STATS);
    setCurrentPath("");
    setTotal(null);
    setPreview(null);
    setPhase("counting");
    try {
      const count = await countSourcePhotos(rootDir, resultFolderName({ longEdge, quality }), () => stopFlagRef.current);
      if (stopFlagRef.current) { setPhase("completed"); return; }
      setTotal(count);
      setPhase("running");
      const result = await runPhotoResize(rootDir, { longEdge, quality }, () => stopFlagRef.current, {
        onProgress: (path, nextStats) => { setCurrentPath(path); setStats(nextStats); },
      });
      setStats(result);
    } catch {
      setNotice("리사이즈 작업 중 오류가 발생했어요. 폴더 접근 권한을 확인해주세요.");
    } finally {
      setPhase("completed");
    }
  };

  const stop = () => {
    stopFlagRef.current = true;
    setStopped(true);
    setPhase("stopping");
  };

  const reset = () => {
    setPhase("idle");
    setNotice("");
    if (preview) { preview.forEach((entry) => URL.revokeObjectURL(entry.url)); setPreview(null); }
  };

  const openResultPreview = async () => {
    if (!rootDir || previewLoading) return;
    if (preview) { preview.forEach((entry) => URL.revokeObjectURL(entry.url)); setPreview(null); return; }
    setPreviewLoading(true);
    try {
      const resultDir = await rootDir.getDirectoryHandle(resultFolderName({ longEdge, quality }));
      const entries = await listResultPhotos(resultDir, PREVIEW_LIMIT);
      const withUrls = await Promise.all(entries.map(async (entry) => {
        const file = await entry.handle.getFile();
        return { path: entry.path, url: URL.createObjectURL(file) };
      }));
      setPreview(withUrls);
    } catch {
      setNotice("결과 폴더를 열지 못했어요.");
    } finally {
      setPreviewLoading(false);
    }
  };

  if (phase === "counting") {
    return (
      <div className={styles.aiPanel}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "40px 0", justifyContent: "center", color: "rgba(255,255,255,.6)" }}>
          <Loader2 size={18} className="spin-icon" />
          <span style={{ fontSize: 13 }}>폴더를 살펴보는 중…</span>
        </div>
      </div>
    );
  }

  if (phase === "running" || phase === "stopping") {
    const done = stats.completed + stats.skipped + stats.failed;
    const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    return (
      <div className={styles.aiPanel}>
        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,.5)", marginBottom: 14 }}>
          {phase === "stopping" ? "중지하는 중…" : `변환 중 · ${percent}%${total ? ` (${done.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")})` : ""}`}
        </div>
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 11, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 7 }}>현재 처리</div>
          <div style={{
            fontSize: 13.5, color: "#fff", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", direction: "rtl", textAlign: "left",
          }}>{currentPath || "폴더를 검색하는 중…"}</div>
          <div style={{ height: 6, background: "rgba(255,255,255,.1)", borderRadius: 3, marginTop: 16, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${percent}%`, background: "#2E9186", borderRadius: 3,
              transition: "width 220ms ease",
            }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <StatBox label="완료" value={stats.completed} tone="ok" />
          <StatBox label="건너뜀" value={stats.skipped} tone="skip" />
          <StatBox label="실패" value={stats.failed} tone="fail" />
        </div>
        <div className={styles.aiActions}>
          <span />
          <div>
            <button type="button" className={styles.secondaryButton} onClick={stop} disabled={phase === "stopping"}>
              <Square size={14} />작업 중지
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className={styles.aiPanel}>
        <div style={{ textAlign: "center", padding: "16px 0 20px" }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", margin: "0 auto 14px", display: "flex",
            alignItems: "center", justifyContent: "center", color: "#fff",
            background: stopped ? "#6B7A78" : "#2E9186",
          }}>
            {stopped ? <OctagonMinus size={24} /> : <CheckCircle2 size={24} />}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{stopped ? "작업이 중지되었습니다" : "변환 완료"}</div>
          <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.5)", marginTop: 6 }}>{longEdge}px · 품질 {quality}%</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
          <StatBox label="완료" value={stats.completed} tone="ok" />
          <StatBox label="건너뜀" value={stats.skipped} tone="skip" />
          <StatBox label="실패" value={stats.failed} tone="fail" />
        </div>
        <div style={{
          display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "13px 16px", marginBottom: preview ? 10 : 16,
        }}>
          <FolderOpen size={16} color="rgba(255,255,255,.5)" />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#fff", fontFamily: "ui-monospace, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rootDir?.name}/{resultFolderName({ longEdge, quality })}
          </span>
          <button type="button" className={styles.mutedButton} onClick={() => void openResultPreview()} disabled={previewLoading}>
            {previewLoading ? <Loader2 size={13} className="spin-icon" /> : null}
            {preview ? "닫기" : "결과 폴더 보기"}
          </button>
        </div>
        {preview ? (
          <div style={{ marginBottom: 16 }}>
            {preview.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", padding: "10px 2px" }}>결과 폴더가 비어 있어요.</div>
            ) : (
              <>
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8,
                  maxHeight: 260, overflowY: "auto", padding: 2,
                }}>
                  {preview.map((entry) => (
                    <div key={entry.path} style={{ borderRadius: 8, overflow: "hidden", background: "rgba(255,255,255,.06)", aspectRatio: "1 / 1" }} title={entry.path}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- FSA API가 준 로컬 blob URL이라 next/image 최적화 대상이 아니다 */}
                      <img src={entry.url} alt={entry.path} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </div>
                  ))}
                </div>
                {preview.length >= PREVIEW_LIMIT ? (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginTop: 8 }}>
                    처음 {PREVIEW_LIMIT}장만 미리 보여드려요. 전체 파일은 실제 폴더에서 확인해주세요.
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        {stats.failures.length > 0 ? (
          <div style={{ border: "1px solid rgba(212,87,75,.35)", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
            <div
              onClick={() => setErrOpen((v) => !v)}
              style={{ background: "rgba(212,87,75,.12)", padding: "10px 15px", fontSize: 12.5, color: "#E88A80", display: "flex", cursor: "pointer" }}
            >
              실패한 파일 {stats.failures.length}개 <span style={{ marginLeft: "auto", color: "rgba(255,255,255,.35)" }}>{errOpen ? "숨기기" : "보기"}</span>
            </div>
            {errOpen ? (
              <div style={{ padding: "6px 15px 12px" }}>
                {stats.failures.map((f) => (
                  <div key={f.path} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.08)", fontSize: 12, color: "rgba(255,255,255,.6)" }}>
                    <b style={{ fontWeight: 400, color: "rgba(255,255,255,.7)", fontFamily: "ui-monospace, Menlo, monospace" }}>{f.path}</b>
                    <i style={{ fontStyle: "normal", color: "rgba(255,255,255,.4)", marginLeft: 10 }}>{f.reason}</i>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className={styles.aiActions}>
          <span />
          <div><button type="button" className={styles.primaryButton} onClick={reset}>설정으로</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aiPanel}>
      <div className={styles.aiIntro}>
        <p>폴더를 고르면 하위 폴더까지 전부 찾아 지정한 해상도·품질로 한 번에 변환합니다.</p>
      </div>

      <section className={styles.aiSection}>
        <h3><span>1.</span> 폴더 선택</h3>
        <div className={styles.folderRow}>
          <span className={styles.folderState}><FolderOpen size={19} aria-hidden="true" />{rootDir?.name || "폴더가 선택되지 않았습니다."}</span>
          <button type="button" className={styles.secondaryButton} onClick={selectFolder}>폴더 선택</button>
        </div>
        {notice ? <p className={styles.inlineNotice} role="status">{notice}</p> : null}
      </section>

      <section className={styles.aiSection}>
        <h3><span>2.</span> 옵션</h3>
        <ChipRow label="해상도" hint="긴 변 기준" value={longEdge} options={RESOLUTIONS} custom onSelect={setLongEdge} onCustom={setLongEdge} />
        <ChipRow label="JPEG 품질" value={quality} options={QUALITIES} onSelect={setQuality} />
      </section>

      <p style={{ fontSize: 11.5, color: "rgba(255,255,255,.4)", lineHeight: 1.8, borderTop: "1px solid rgba(255,255,255,.08)", paddingTop: 14, marginBottom: 20 }}>
        하위 폴더의 사진도 자동으로 처리합니다. 원본 사진은 변경되지 않습니다.<br />
        원본보다 작은 사진은 확대하지 않고 품질만 적용합니다.<br />
        이미 변환된 사진은 건너뜁니다.
      </p>

      <div className={styles.aiActions}>
        <span />
        <div>
          <button type="button" className={styles.primaryButton} disabled={!rootDir} onClick={() => void start()}>
            <Loader2 size={15} style={{ display: "none" }} />변환 시작
          </button>
        </div>
      </div>
    </div>
  );
}
