"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const VIDEO_EXTS = new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv", "mxf"]);
const OUTPUT_FOLDER_NAME = "FHD_변환";
const LARGE_FILE_WARN_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5GB — 브라우저 메모리 한계 경고선

const QUALITY_PRESETS = [
  { value: "high",     label: "고화질",   crf: 18, desc: "용량 크지만 화질 우선" },
  { value: "standard", label: "표준",     crf: 23, desc: "화질·용량 균형 (권장)" },
  { value: "small",    label: "저용량",   crf: 28, desc: "용량 우선, 화질 다소 저하" },
] as const;
type Quality = (typeof QUALITY_PRESETS)[number]["value"];

type Step = "setup" | "scanning" | "review" | "converting" | "done";
const STEP_ORDER: Step[] = ["setup", "scanning", "review", "converting", "done"];
const STEP_LABELS = ["설정", "파일 스캔", "변환 대상 확인", "변환 중", "완료"];

type FileStatus = "pending" | "converting" | "done" | "error" | "skipped";
interface VideoFileEntry {
  name: string;
  handle: FileSystemFileHandle;
  size: number;
}
interface ResultEntry {
  status: FileStatus;
  outputSize?: number;
  error?: string;
}

const C = {
  teal: "#155855", orange: "#E85D2C", green: "#22876A", red: "#DC2626",
  white: "#FFFFFF", border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", light: "#EAF4F2", bg: "#EDF5F3",
};

function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

/* ════════════════════════════════════════════════
   PRESENTATIONAL HELPERS — photo-sorting/video-sorting와 동일한 스타일
═══════════════════════════════════════════════ */
function Btn({ onClick, disabled, children, variant = "primary" }: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost";
}) {
  const base: React.CSSProperties = { height: 42, padding: "0 22px", border: "none", borderRadius: 10, fontFamily: "inherit", fontSize: 13, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "opacity .15s" };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: C.teal, color: "#fff" },
    secondary: { background: C.white, color: C.teal, border: `1.5px solid ${C.border}` },
    ghost: { background: C.white, color: C.teal, border: `1.5px solid ${C.border}` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.white, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden", ...s }}>{children}</div>;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 900, color: C.teal }}>{title}</div>
      <div style={{ padding: "14px 20px" }}>{children}</div>
    </Card>
  );
}

function ProgressBar({ cur, total, msg }: { cur: number; total: number; msg: string }) {
  const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
  return (
    <Card>
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{cur} / {total}</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: C.teal }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.teal, borderRadius: 4, transition: "width .2s" }} />
        </div>
        <div style={{ fontSize: 11, color: C.hint, wordBreak: "break-all" }}>{msg}</div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function VideoConvertPage() {
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  const [step, setStep] = useState<Step>("setup");
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [quality, setQuality] = useState<Quality>("standard");
  const [videoFiles, setVideoFiles] = useState<VideoFileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ cur: 0, total: 0, msg: "" });
  const [fileProgressPct, setFileProgressPct] = useState(0);
  const [results, setResults] = useState<Record<string, ResultEntry>>({});
  const [engineState, setEngineState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const ffmpegRef = useRef<any>(null);
  const stepPos = STEP_ORDER.indexOf(step);

  const pickDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRootDir(h);
    } catch {}
  };

  const handleScan = useCallback(async () => {
    if (!rootDir) return;
    setStep("scanning");
    const entries: VideoFileEntry[] = [];
    setProgress({ cur: 0, total: 0, msg: "폴더 스캔 중..." });

    for await (const [name, handle] of (rootDir as any).entries()) {
      if (handle.kind !== "file") continue;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (!VIDEO_EXTS.has(ext)) continue;
      try {
        const file = await (handle as FileSystemFileHandle).getFile();
        entries.push({ name, handle: handle as FileSystemFileHandle, size: file.size });
      } catch { /* 읽을 수 없는 파일은 건너뜀 */ }
    }

    setVideoFiles(entries);
    setSelected(new Set(entries.map((e) => e.name)));
    setStep("review");
  }, [rootDir]);

  const toggleSelected = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ffmpeg.wasm 엔진 로딩 — 코어 파일은 public/ffmpeg에 self-host (CDN 의존 없음, 약 30MB라 몇 초 소요)
  const loadEngine = useCallback(async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setEngineState("loading");
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress: p }: { progress: number }) => {
        setFileProgressPct(Math.max(0, Math.min(100, Math.round(p * 100))));
      });
      await ffmpeg.load({
        coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
        wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
      });
      ffmpegRef.current = ffmpeg;
      setEngineState("ready");
      return ffmpeg;
    } catch (e) {
      setEngineState("error");
      throw e;
    }
  }, []);

  useEffect(() => {
    if (step === "review" && engineState === "idle") loadEngine().catch(() => {});
  }, [step, engineState, loadEngine]);

  const handleConvert = useCallback(async () => {
    if (!rootDir) return;
    const targets = videoFiles.filter((f) => selected.has(f.name));
    if (targets.length === 0) return;

    setStep("converting");
    setResults(Object.fromEntries(targets.map((f) => [f.name, { status: "pending" as FileStatus }])));

    let ffmpeg: any;
    try {
      ffmpeg = await loadEngine();
    } catch {
      setResults(Object.fromEntries(targets.map((f) => [f.name, { status: "error" as FileStatus, error: "변환 엔진 로딩 실패" }])));
      setStep("done");
      return;
    }

    const outDir = await (rootDir as any).getDirectoryHandle(OUTPUT_FOLDER_NAME, { create: true });
    const crf = QUALITY_PRESETS.find((q) => q.value === quality)!.crf;
    const { fetchFile } = await import("@ffmpeg/util");

    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      setFileProgressPct(0);
      setProgress({ cur: i, total: targets.length, msg: `변환 중: ${entry.name}` });
      setResults((prev) => ({ ...prev, [entry.name]: { status: "converting" } }));

      const inputName = `in_${i}.${entry.name.split(".").pop()}`;
      const outputName = `out_${i}.mp4`;
      const finalName = entry.name.replace(/\.[^.]+$/, "") + "_FHD.mp4";

      try {
        const file = await entry.handle.getFile();
        await ffmpeg.writeFile(inputName, await fetchFile(file));
        await ffmpeg.exec([
          "-i", inputName,
          "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black",
          "-c:v", "libx264", "-crf", String(crf), "-preset", "veryfast",
          "-c:a", "aac", "-b:a", "192k",
          outputName,
        ]);
        const data = await ffmpeg.readFile(outputName);

        const outFileHandle = await (outDir as any).getFileHandle(finalName, { create: true });
        const writable = await outFileHandle.createWritable();
        await writable.write(data as Uint8Array);
        await writable.close();

        setResults((prev) => ({ ...prev, [entry.name]: { status: "done", outputSize: (data as Uint8Array).byteLength } }));
      } catch (e: any) {
        setResults((prev) => ({ ...prev, [entry.name]: { status: "error", error: e?.message || "변환 실패" } }));
      } finally {
        try { await ffmpeg.deleteFile(inputName); } catch {}
        try { await ffmpeg.deleteFile(outputName); } catch {}
      }
    }

    setProgress({ cur: targets.length, total: targets.length, msg: "완료" });
    setStep("done");
  }, [rootDir, videoFiles, selected, quality, loadEngine]);

  const doneCount = Object.values(results).filter((r) => r.status === "done").length;
  const errorCount = Object.values(results).filter((r) => r.status === "error").length;

  const renderStepIndicator = () => (
    <div className="pc-workflow-bar" style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: "10px 24px", overflowX: "auto" }}>
      <div className="pc-workflow-track" style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {STEP_LABELS.map((lbl, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", fontSize: 9, fontWeight: 900,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: i < stepPos ? C.green : i === stepPos ? C.teal : C.border,
              color: i <= stepPos ? "#fff" : C.muted,
            }}>{i < stepPos ? "✓" : i + 1}</div>
            <span style={{ fontSize: 12, fontWeight: i === stepPos ? 800 : 500, color: i === stepPos ? C.teal : C.hint }}>{lbl}</span>
            {i < STEP_LABELS.length - 1 && <span style={{ color: C.border, fontSize: 10 }}>›</span>}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.txt, fontFamily: "'Noto Sans KR', sans-serif" }}>
      {renderStepIndicator()}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px" }}>

        {step === "setup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: C.txt }}>🔄 4K → FHD 변환 설정</h2>

            {!hasFS && (
              <div style={{ padding: 14, background: "#FFF3CD", borderRadius: 10, fontSize: 12, color: "#856404", border: "1px solid #FFD980" }}>
                ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다.
              </div>
            )}

            <div style={{ padding: 14, background: C.light, borderRadius: 10, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              💡 이 도구는 브라우저 안에서 직접 영상을 변환합니다 (서버 업로드 없음). 파일이 크거나 개수가 많으면 시간이 꽤 걸릴 수 있어요.
              변환된 파일은 원본 폴더 안 <strong style={{ color: C.teal }}>"{OUTPUT_FOLDER_NAME}"</strong> 폴더에 저장됩니다.
            </div>

            <SectionCard title="변환할 폴더 선택">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Btn onClick={pickDir} variant="secondary">📁 폴더 선택</Btn>
                <span style={{ fontSize: 13, color: rootDir ? C.teal : C.hint, fontWeight: rootDir ? 700 : 400 }}>
                  {rootDir ? `선택됨: ${(rootDir as any).name}` : "선택된 폴더 없음"}
                </span>
              </div>
            </SectionCard>

            <SectionCard title="화질 설정">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {QUALITY_PRESETS.map((q) => (
                  <button key={q.value} onClick={() => setQuality(q.value)} style={{
                    padding: "14px 10px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                    border: `2px solid ${quality === q.value ? C.teal : C.border}`,
                    background: quality === q.value ? C.light : C.white,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: quality === q.value ? C.teal : C.txt }}>{q.label}</div>
                    <div style={{ fontSize: 11, color: C.hint, marginTop: 4 }}>{q.desc}</div>
                  </button>
                ))}
              </div>
            </SectionCard>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={handleScan} disabled={!rootDir}>시작하기 →</Btn>
            </div>
          </div>
        )}

        {step === "scanning" && (
          <ProgressBar cur={0} total={0} msg={progress.msg} />
        )}

        {step === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: C.txt }}>변환 대상 확인 ({selected.size} / {videoFiles.length}개 선택)</h2>

            {engineState === "loading" && (
              <div style={{ padding: 12, background: C.light, borderRadius: 10, fontSize: 12, color: C.teal }}>
                ⏳ 변환 엔진을 불러오는 중입니다 (최초 1회, 약 30MB)...
              </div>
            )}
            {engineState === "error" && (
              <div style={{ padding: 12, background: "#FFF0EB", borderRadius: 10, fontSize: 12, color: C.orange }}>
                ⚠️ 변환 엔진 로딩에 실패했습니다. 새로고침 후 다시 시도해주세요.
              </div>
            )}

            {videoFiles.length === 0 ? (
              <Card><div style={{ padding: 32, textAlign: "center", color: C.hint, fontSize: 13 }}>영상 파일을 찾지 못했습니다.</div></Card>
            ) : (
              <Card>
                <div style={{ maxHeight: 420, overflowY: "auto" }}>
                  {videoFiles.map((f) => (
                    <label key={f.name} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
                      borderBottom: `1px solid ${C.border}`, cursor: "pointer",
                    }}>
                      <input type="checkbox" checked={selected.has(f.name)} onChange={() => toggleSelected(f.name)} />
                      <span style={{ flex: 1, fontSize: 13, wordBreak: "break-all" }}>{f.name}</span>
                      <span style={{ fontSize: 11, color: f.size > LARGE_FILE_WARN_BYTES ? C.orange : C.hint, fontWeight: f.size > LARGE_FILE_WARN_BYTES ? 700 : 400 }}>
                        {fmtBytes(f.size)}{f.size > LARGE_FILE_WARN_BYTES ? " ⚠️" : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </Card>
            )}

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn onClick={() => setStep("setup")} variant="ghost">← 뒤로</Btn>
              <Btn onClick={handleConvert} disabled={selected.size === 0}>변환 시작 →</Btn>
            </div>
          </div>
        )}

        {step === "converting" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ProgressBar cur={progress.cur} total={progress.total} msg={progress.msg} />
            <Card>
              <div style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>현재 파일 진행률</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.teal }}>{fileProgressPct}%</span>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fileProgressPct}%`, background: C.orange, borderRadius: 3, transition: "width .2s" }} />
                </div>
              </div>
            </Card>
          </div>
        )}

        {step === "done" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card>
              <div style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{errorCount === 0 ? "✅" : "⚠️"}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.txt, marginBottom: 6 }}>
                  변환 완료 — 성공 {doneCount}개{errorCount > 0 ? ` · 실패 ${errorCount}개` : ""}
                </div>
                <div style={{ fontSize: 12, color: C.hint }}>
                  원본 폴더의 "{OUTPUT_FOLDER_NAME}" 폴더에 저장되었습니다.
                </div>
              </div>
            </Card>

            <Card>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {Object.entries(results).map(([name, r]) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 14 }}>{r.status === "done" ? "✅" : r.status === "error" ? "❌" : "⏳"}</span>
                    <span style={{ flex: 1, fontSize: 13, wordBreak: "break-all" }}>{name}</span>
                    <span style={{ fontSize: 11, color: r.status === "error" ? C.orange : C.hint }}>
                      {r.status === "done" ? fmtBytes(r.outputSize ?? 0) : r.status === "error" ? (r.error ?? "실패") : ""}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={() => { setStep("setup"); setVideoFiles([]); setSelected(new Set()); setResults({}); }} variant="secondary">처음으로</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
