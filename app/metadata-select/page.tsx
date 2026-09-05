"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, HelpCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import GlobalHeader from "@/components/GlobalHeader";
import { C, R } from "@/lib/theme";
import { scanJpgFiles, scanRawFiles } from "@/lib/metadataSelect/folderScan";
import { readExifDateTime } from "@/lib/metadataSelect/readExifDateTime";
import { copyFileStreamed } from "@/lib/metadataSelect/copy";
import {
  buildOriginalIndex,
  buildRawIndexByBasename,
  matchSelectionToRaw,
  type MetadataSelectRow,
  type MetadataSelectStatus,
} from "@/lib/metadataSelect/matcher";
import { SELECT_MATCH_RAW_EXTENSIONS } from "@/lib/selectMatch/nameParsing";

type Phase = "idle" | "scanning_originals" | "scanning_raw" | "checking_selections" | "copying" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "",
  scanning_originals: "원본 JPG 분석 중...",
  scanning_raw: "RAW 찾는 중...",
  checking_selections: "선택본 확인 중...",
  copying: "복사 중...",
  done: "",
};

const STATUS_META: Record<MetadataSelectStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  success: { label: "매칭 성공", icon: CheckCircle2, color: C.success },
  needs_review: { label: "확인 필요", icon: HelpCircle, color: C.gold },
  metadata_missing: { label: "메타데이터 없음", icon: XCircle, color: C.hint },
  raw_missing: { label: "RAW 미발견", icon: AlertTriangle, color: C.orange },
  error: { label: "오류", icon: XCircle, color: C.danger },
};

function leafName(name: string): string {
  return name.split("/").pop() ?? name;
}

function Btn({ children, onClick, disabled, style: s }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "9px 20px", fontSize: 13, fontWeight: 700, borderRadius: R.md, border: "none",
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
        background: disabled ? C.border : C.teal, color: disabled ? C.hint : C.white,
        opacity: disabled ? 0.6 : 1, transition: "opacity .15s",
        ...s,
      }}
    >
      {children}
    </button>
  );
}

function FolderPickerRow({
  step, label, dir, onPick,
}: {
  step: number; label: string; dir: FileSystemDirectoryHandle | null; onPick: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{
        width: 24, height: 24, borderRadius: "50%", background: C.teal, color: C.white,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0,
      }}>{step}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{label}</div>
        {dir && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{dir.name}</div>}
      </div>
      <Btn onClick={onPick}>{dir ? `✅ ${dir.name}` : "📂 폴더 선택"}</Btn>
    </div>
  );
}

export default function MetadataSelectPage() {
  const embedded = usePathname() === "/photo-sorting";
  const [hasFS, setHasFS] = useState(false);
  useEffect(() => { setHasFS("showDirectoryPicker" in window); }, []);

  const [selectionDir, setSelectionDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [originalDir, setOriginalDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<MetadataSelectRow[]>([]);
  const [error, setError] = useState("");

  const pick = async (setter: (dir: FileSystemDirectoryHandle) => void, mode: "readwrite" | "read") => {
    try {
      const dir = await (window as any).showDirectoryPicker({ mode });
      setter(dir);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("폴더 선택에 실패했습니다.");
    }
  };

  const canStart = hasFS && !!selectionDir && !!originalDir && !!rawDir && phase === "idle";

  async function run() {
    if (!selectionDir || !originalDir || !rawDir) return;
    setError("");
    setRows([]);

    try {
      // 1. 원본 JPG 촬영시간 인덱스 생성
      setPhase("scanning_originals");
      const originalFiles = await scanJpgFiles(originalDir);
      const originalEntries: { name: string; normalizedDateTime: string | null }[] = [];
      for (const item of originalFiles) {
        let normalizedDateTime: string | null = null;
        try { normalizedDateTime = await readExifDateTime(await item.handle.getFile()); } catch { normalizedDateTime = null; }
        originalEntries.push({ name: item.name, normalizedDateTime });
      }
      const originalIndex = buildOriginalIndex(originalEntries);

      // 2. RAW basename 인덱스 생성
      setPhase("scanning_raw");
      const rawFiles = await scanRawFiles(rawDir);
      const rawHandleByName = new Map<string, FileSystemFileHandle>(rawFiles.map((f) => [f.name, f.handle]));
      const rawIndex = buildRawIndexByBasename(rawFiles, SELECT_MATCH_RAW_EXTENSIONS);

      // 3. 고객 선택본 EXIF 확인 → lookup
      setPhase("checking_selections");
      const selectionFiles = await scanJpgFiles(selectionDir);
      const nextRows: MetadataSelectRow[] = [];
      for (const item of selectionFiles) {
        try {
          const normalizedDateTime = await readExifDateTime(await item.handle.getFile());
          nextRows.push(matchSelectionToRaw(item.name, normalizedDateTime, originalIndex, rawIndex));
        } catch (e: any) {
          nextRows.push({
            selectionName: item.name, status: "error", normalizedDateTime: null,
            message: `EXIF 분석 실패: ${e?.message ?? "알 수 없는 오류"}`,
          });
        }
      }

      // 4. RAW 복사 (매칭 성공만)
      setPhase("copying");
      const selectedRawDir = await (rawDir as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
      for (const row of nextRows) {
        if (row.status !== "success" || !row.rawName) continue;
        const handle = rawHandleByName.get(row.rawName);
        if (!handle) { row.status = "error"; row.message = "RAW 파일 핸들을 찾지 못했습니다."; continue; }
        try {
          await copyFileStreamed(handle, selectedRawDir, leafName(row.rawName));
        } catch (e: any) {
          row.status = "error";
          row.message = `RAW 복사 실패: ${e?.message ?? "알 수 없는 오류"}`;
        }
      }

      setRows(nextRows);
      setPhase("done");
    } catch (e: any) {
      setError(e?.message ?? "메타데이터 매칭 중 오류가 발생했습니다.");
      setPhase("idle");
    }
  }

  const counts = rows.reduce((acc, row) => { acc[row.status] = (acc[row.status] ?? 0) + 1; return acc; }, {} as Record<MetadataSelectStatus, number>);
  const running = phase !== "idle" && phase !== "done";

  return (
    <main className="pc-page" style={{ color: C.ink, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>
      {!embedded ? (
        <GlobalHeader
          title="메타데이터 셀렉"
          description="파일명을 변경한 선택본도 촬영시간 메타데이터로 RAW를 찾습니다."
        />
      ) : null}
      <div className="pc-content">
        {!hasFS ? (
          <div className="pc-card pc-card--padded" style={{ fontSize: 12, color: C.danger, textAlign: "center" }}>
            Chrome 또는 Edge를 사용해주세요.
          </div>
        ) : (
          <section className="pc-card pc-card--padded">
            <FolderPickerRow step={1} label="고객 선택본" dir={selectionDir} onPick={() => pick(setSelectionDir, "read")} />
            <FolderPickerRow step={2} label="원본 JPG" dir={originalDir} onPick={() => pick(setOriginalDir, "read")} />
            <FolderPickerRow step={3} label="RAW 원본" dir={rawDir} onPick={() => pick(setRawDir, "readwrite")} />

            <div style={{ marginTop: 18, textAlign: "center" }}>
              <Btn onClick={run} disabled={!canStart}>
                {running ? PHASE_LABEL[phase] : "메타데이터 매칭 시작"}
              </Btn>
            </div>

            {error && <div style={{ marginTop: 12, fontSize: 12, color: C.danger, textAlign: "center" }}>{error}</div>}

            <div style={{ marginTop: 16, background: C.light, borderRadius: R.sm, padding: "12px 14px", fontSize: 11, color: C.muted, lineHeight: 1.9 }}>
              <Clock size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
              파일명이 아니라 사진 내부 EXIF의 촬영시간(DateTimeOriginal)으로 원본 JPG와 RAW를 찾습니다.
              매칭된 RAW는 RAW 원본 폴더 안 <strong>Selected_RAW/</strong>에 복사됩니다.
            </div>
          </section>
        )}

        {phase === "done" && (
          <section className="pc-card pc-card--padded" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 18, fontSize: 13 }}>
              <div><span style={{ color: C.muted }}>총 선택본</span> <strong>{rows.length}</strong></div>
              {(Object.keys(STATUS_META) as MetadataSelectStatus[]).filter((status) => counts[status]).map((status) => (
                <div key={status}>
                  <span style={{ color: C.muted }}>{STATUS_META[status].label}</span>{" "}
                  <strong style={{ color: STATUS_META[status].color }}>{counts[status]}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row) => {
                const meta = STATUS_META[row.status];
                const Icon = meta.icon;
                return (
                  <div key={row.selectionName} style={{ display: "flex", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: R.sm }}>
                    <Icon size={16} color={meta.color} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ minWidth: 0, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: C.ink }}>{row.selectionName}</div>
                      {row.status === "success" ? (
                        <div style={{ color: C.muted, marginTop: 2, lineHeight: 1.7 }}>
                          → {row.matchedOriginalName && leafName(row.matchedOriginalName)}<br />→ {row.rawName && leafName(row.rawName)}
                        </div>
                      ) : (
                        <div style={{ color: C.muted, marginTop: 2 }}>
                          {row.message}
                          {row.candidateNames && row.candidateNames.length > 0 && (
                            <span>: {row.candidateNames.map(leafName).join(", ")}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>고객 선택본 폴더에서 JPG를 찾지 못했습니다.</div>}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
