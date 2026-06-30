"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GALLERY_STATUS_COLOR, GALLERY_STATUS_LABEL } from "@/lib/selectGallery";
import type { SelectGallery, SelectGalleryImage, ClientPhotoSelection, SelectRawMatch } from "@/lib/selectGallery";

const C = {
  teal: "#155855", bg: "#F0F9F8", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", green: "#22876A",
  red: "#DC2626", yellow: "#D97706", purple: "#7C3AED",
};

const RAW_EXTS = new Set(["arw","cr3","cr2","nef","raf","dng","orf","rw2","x3f","3fr","mef","mrw","pef","srw"]);

interface RawMatchRow { selected_jpg: string; selected_basename: string; matched_raw?: string; raw_extension?: string; status: "matched"|"raw_missing"; }

/* ════════════════════════════════════ */
export default function SelectGalleryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [gallery, setGallery] = useState<SelectGallery | null>(null);
  const [images, setImages] = useState<SelectGalleryImage[]>([]);
  const [selection, setSelection] = useState<ClientPhotoSelection | null>(null);
  const [rawMatches, setRawMatches] = useState<SelectRawMatch[]>([]);
  const [loading, setLoading] = useState(true);

  // RAW 매칭 상태
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState("");
  const hasFS = typeof window !== "undefined" && "showDirectoryPicker" in window;

  // 이메일 발송
  const [mailEmail, setMailEmail] = useState("");
  const [mailName, setMailName] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [mailResult, setMailResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);

  // 이미지 업로드
  const [uploading, setUploading] = useState(false);
  const [uploadLog, setUploadLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/select-galleries/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setGallery(d.gallery);
          setImages(d.images ?? []);
          setSelection(d.selection ?? null);
          setRawMatches(d.rawMatches ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ── 링크 복사 ── */
  const copyLink = () => {
    if (!gallery) return;
    const url = `${window.location.origin}/select/${gallery.share_token}`;
    navigator.clipboard.writeText(url);
    alert("셀렉 링크가 복사되었습니다:\n" + url);
  };

  /* ── 이미지 업로드 ── */
  const uploadImages = async (fileList: FileList | null) => {
    if (!fileList || !gallery) return;
    setUploading(true);
    setUploadLog([]);
    const BATCH = 5;
    const files = Array.from(fileList);
    let done = 0;
    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      const fd = new FormData();
      batch.forEach(f => fd.append("files", f));
      const res = await fetch(`/api/select-galleries/${id}/upload-images`, { method: "POST", body: fd });
      const d = await res.json();
      done += d.uploaded ?? 0;
      setUploadLog(prev => [...prev, `✅ ${done}/${files.length}장 업로드됨`]);
    }
    setUploadLog(prev => [...prev, `완료! 총 ${done}장 업로드`]);
    setUploading(false);
    load();
  };

  /* ── 브랜드메일 발송 ── */
  const sendMail = async () => {
    if (!gallery || !mailEmail) return;
    setSendingMail(true);
    setMailResult(null);
    const res = await fetch(`/api/select-galleries/${id}/send-mail`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: mailEmail, to_name: mailName }),
    });
    const d = await res.json();
    setSendingMail(false);
    if (d.ok) {
      setMailResult({ ok: true, msg: d.preview ? "메일 미리보기 (RESEND_API_KEY 미설정)" : "메일이 발송되었습니다!", url: d.selectUrl });
      load();
    } else {
      setMailResult({ ok: false, msg: d.error ?? "오류 발생" });
    }
  };

  /* ── RAW 폴더 선택 ── */
  const pickRawDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRawDir(h);
    } catch {}
  };

  /* ── RAW 자동 매칭 실행 ── */
  const runRawMatch = async () => {
    if (!rawDir || !selection || !gallery) return;
    setMatching(true);
    setMatchProgress("RAW 폴더 스캔 중...");

    // RAW 인덱스 빌드 (재귀)
    const rawIndex = new Map<string, { name: string; ext: string }>();
    const scan = async (dir: FileSystemDirectoryHandle, depth = 0) => {
      if (depth > 5) return;
      for await (const [name, handle] of (dir as any).entries()) {
        if (name === "Selected_RAW") continue;
        if ((handle as FileSystemHandle).kind === "directory") {
          await scan(handle as FileSystemDirectoryHandle, depth + 1);
        } else {
          const ext = name.split(".").pop()?.toLowerCase() ?? "";
          if (RAW_EXTS.has(ext)) {
            const base = name.replace(/\.[^.]+$/, "").toLowerCase();
            rawIndex.set(base, { name, ext });
          }
        }
      }
    };
    await scan(rawDir);
    setMatchProgress(`RAW ${rawIndex.size}개 스캔 완료. 매칭 중...`);

    // 매칭
    const matches: RawMatchRow[] = selection.selected_files.map(jpg => {
      const base = jpg.replace(/\.[^.]+$/, "").toLowerCase();
      const raw = rawIndex.get(base);
      return {
        selected_jpg: jpg,
        selected_basename: base,
        matched_raw: raw?.name,
        raw_extension: raw?.ext,
        status: raw ? "matched" : "raw_missing",
      };
    });

    const matchedCount = matches.filter(m => m.status === "matched").length;

    // Selected_RAW 폴더 생성 + 파일 복사
    if (matchedCount > 0) {
      try {
        const outDir = await (rawDir as any).getDirectoryHandle("Selected_RAW", { create: true }) as FileSystemDirectoryHandle;
        let copied = 0;
        for (const m of matches) {
          if (m.status !== "matched" || !m.matched_raw) continue;
          setMatchProgress(`복사 중: ${m.matched_raw} (${copied + 1}/${matchedCount})`);
          try {
            const srcHandle = await findFileHandle(rawDir, m.matched_raw);
            if (srcHandle) {
              const file = await srcHandle.getFile();
              const ab = await file.arrayBuffer();
              const destHandle = await (outDir as any).getFileHandle(m.matched_raw, { create: true }) as FileSystemFileHandle;
              const writable = await (destHandle as any).createWritable();
              await writable.write(ab);
              await writable.close();
              copied++;
            }
          } catch (e) { console.error("copy error:", e); }
        }
        setMatchProgress(`RAW 복사 완료: ${copied}/${matchedCount}장`);
      } catch (e) { console.error("output dir error:", e); }
    }

    // CSV 생성
    const csvRows = ["JPG파일명,RAW파일명,상태", ...matches.map(m => `${m.selected_jpg},${m.matched_raw ?? "없음"},${m.status === "matched" ? "매칭" : "RAW 없음"}`)].join("\n");
    downloadText(csvRows, "raw_match_report.csv");

    // DB 저장
    await fetch(`/api/select-galleries/${id}/raw-match`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection_id: selection.id, matches }),
    });

    setMatching(false);
    load();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: "'Noto Sans KR',sans-serif" }}>불러오는 중...</div>;
  if (!gallery) return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: "'Noto Sans KR',sans-serif" }}>갤러리를 찾을 수 없습니다</div>;

  const selectUrl = typeof window !== "undefined" ? `${window.location.origin}/select/${gallery.share_token}` : "";
  const statusColor = GALLERY_STATUS_COLOR[gallery.status];
  const matchedCount = rawMatches.filter(m => m.status === "matched").length;
  const missingCount = rawMatches.filter(m => m.status === "raw_missing").length;
  const expiresDate = new Date(gallery.file_expires_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px", fontFamily: "'Noto Sans KR',sans-serif", color: C.txt }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Link href="/select-galleries" style={{ color: C.muted, fontSize: 20, textDecoration: "none", lineHeight: 1 }}>←</Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.teal }}>{gallery.shooting_name ?? gallery.title}</div>
          {gallery.hospital_name && <div style={{ fontSize: 13, color: C.muted }}>{gallery.hospital_name}</div>}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: statusColor + "20", color: statusColor }}>
          {GALLERY_STATUS_LABEL[gallery.status]}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 요약 카드 */}
        <Card title="갤러리 정보">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            {[
              ["총 이미지", `${gallery.total_jpg_count}장`],
              ["선택 완료", gallery.selected_count > 0 ? `${gallery.selected_count}장` : "대기 중"],
              ["파일 만료", expiresDate],
              ["촬영일", gallery.shooting_date ?? "-"],
            ].map(([l, v]) => (
              <div key={l} style={{ background: C.bg, borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{l}</div>
                <div style={{ fontWeight: 700 }}>{v}</div>
              </div>
            ))}
          </div>
          {selectUrl && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn onClick={copyLink} variant="secondary">🔗 셀렉 링크 복사</Btn>
              <a href={selectUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-block", padding: "8px 16px", fontSize: 12, fontWeight: 700, color: C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 8, textDecoration: "none" }}>
                👁 고객 화면 미리보기
              </a>
            </div>
          )}
        </Card>

        {/* 이미지 업로드 */}
        <Card title={`📁 원본 이미지 업로드 (${images.length}장 등록됨)`}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.7 }}>
            고객이 볼 JPG 파일을 업로드합니다. Supabase Storage에 저장되며 {expiresDate}에 자동 삭제됩니다.
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg" style={{ display: "none" }}
            onChange={e => uploadImages(e.target.files)} />
          <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "업로드 중..." : "📤 JPG 파일 업로드"}
          </Btn>
          {uploadLog.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto", fontFamily: "monospace", fontSize: 11, color: C.green, background: "#F0FDF4", borderRadius: 6, padding: 10 }}>
              {uploadLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </Card>

        {/* 브랜드메일 발송 */}
        <Card title="📧 브랜드메일 발송">
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={mailEmail} onChange={e => setMailEmail(e.target.value)} placeholder="고객 이메일" type="email"
              style={{ flex: 2, minWidth: 200, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
            <input value={mailName} onChange={e => setMailName(e.target.value)} placeholder="고객명 (선택)" type="text"
              style={{ flex: 1, minWidth: 120, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
          </div>
          <Btn onClick={sendMail} disabled={!mailEmail || sendingMail}>
            {sendingMail ? "발송 중..." : "📧 브랜드메일 발송"}
          </Btn>
          {mailResult && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: mailResult.ok ? "#F0FDF4" : "#FFF5F5", color: mailResult.ok ? C.green : C.red, fontSize: 12 }}>
              {mailResult.msg}{mailResult.url && <><br /><span style={{ color: C.teal }}>{mailResult.url}</span></>}
            </div>
          )}
        </Card>

        {/* 고객 선택 결과 */}
        <Card title="✅ 고객 셀렉 결과">
          {selection ? (
            <div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <InfoBadge label="선택 방식" value={selection.method === "web_select" ? "웹 선택" : "파일 업로드"} />
                <InfoBadge label="선택 사진" value={`${selection.selected_count}장`} />
                <InfoBadge label="제출 일시" value={new Date(selection.submitted_at).toLocaleString("ko-KR")} />
              </div>
              {selection.customer_memo && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", marginBottom: 12 }}>
                  💬 {selection.customer_memo}
                </div>
              )}
              <div style={{ background: C.bg, borderRadius: 8, padding: 12, maxHeight: 200, overflowY: "auto" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 8 }}>선택 파일명 ({selection.selected_files.length}개)</div>
                {selection.selected_files.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, fontFamily: "monospace", color: C.txt, padding: "2px 0", borderBottom: `1px solid ${C.border}` }}>{f}</div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Btn onClick={() => {
                  const csv = ["파일명", ...selection.selected_files].join("\n");
                  downloadText(csv, "selection_report.csv");
                }} variant="secondary">↓ 선택 결과 CSV 다운로드</Btn>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>
              고객이 아직 사진을 선택하지 않았습니다
            </div>
          )}
        </Card>

        {/* RAW 자동 매칭 */}
        {selection && (
          <Card title="🎯 RAW 자동 매칭">
            {rawMatches.length > 0 ? (
              <div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <InfoBadge label="매칭 성공" value={`${matchedCount}장`} color={C.green} />
                  <InfoBadge label="RAW 누락" value={`${missingCount}장`} color={missingCount > 0 ? C.red : C.muted} />
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: 12, maxHeight: 160, overflowY: "auto", fontSize: 11, fontFamily: "monospace" }}>
                  {rawMatches.map((m, i) => (
                    <div key={i} style={{ color: m.status === "matched" ? C.green : C.red, padding: "1px 0" }}>
                      {m.status === "matched" ? "✅" : "❌"} {m.selected_jpg} → {m.matched_raw ?? "없음"}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}>
                  <Btn onClick={() => {
                    const csv = ["JPG,RAW,상태", ...rawMatches.map(m => `${m.selected_jpg},${m.matched_raw ?? "없음"},${m.status}`)].join("\n");
                    downloadText(csv, "raw_match_report.csv");
                  }} variant="secondary">↓ RAW 매칭 리포트 CSV</Btn>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.7 }}>
                고객 선택 완료 → RAW 폴더를 선택하면 자동으로 매칭합니다.<br />
                <code style={{ fontSize: 11, background: C.bg, padding: "1px 4px", borderRadius: 3 }}>Selected_RAW/</code> 폴더가 RAW 폴더 내에 생성됩니다.
              </div>
            )}

            {!hasFS && (
              <div style={{ background: "#FFF3CD", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#856404", marginBottom: 12 }}>
                ⚠️ Chrome 또는 Edge 브라우저에서만 파일 시스템 접근이 가능합니다
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn onClick={pickRawDir} variant="secondary" disabled={!hasFS}>
                {rawDir ? `✅ ${rawDir.name}` : "📂 RAW 폴더 선택"}
              </Btn>
              <Btn onClick={runRawMatch} disabled={!rawDir || matching}>
                {matching ? matchProgress || "매칭 중..." : "🎯 RAW 자동 매칭 시작"}
              </Btn>
            </div>
            {matching && matchProgress && (
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>{matchProgress}</div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── UTILS ── */
async function findFileHandle(dir: FileSystemDirectoryHandle, filename: string, depth = 0): Promise<FileSystemFileHandle | null> {
  if (depth > 5) return null;
  for await (const [name, handle] of (dir as any).entries()) {
    if (name === "Selected_RAW") continue;
    if ((handle as FileSystemHandle).kind === "file" && name === filename) return handle as FileSystemFileHandle;
    if ((handle as FileSystemHandle).kind === "directory") {
      const found = await findFileHandle(handle as FileSystemDirectoryHandle, filename, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function downloadText(content: string, filename: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ── SUB COMPONENTS ── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 800, color: C.teal }}>{title}</div>
      <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
  );
}

function InfoBadge({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.bg, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: color ?? C.txt }}>{value}</div>
    </div>
  );
}

function Btn({ children, onClick, variant, disabled, style }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "secondary"; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "9px 18px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "opacity .15s",
        border: variant === "secondary" ? `1.5px solid ${C.border}` : "none",
        background: variant === "secondary" ? "transparent" : C.teal,
        color: variant === "secondary" ? C.txt : C.white, ...style }}>
      {children}
    </button>
  );
}
