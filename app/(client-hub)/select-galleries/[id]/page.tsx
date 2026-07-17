"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { GALLERY_STATUS_COLOR, GALLERY_STATUS_LABEL } from "@/lib/selectGallery";
import type { SelectGallery, SelectGalleryImage, ClientPhotoSelection, SelectRawMatch } from "@/lib/selectGallery";

const C = {
  teal: "#155855", bg: "#F0F9F8", white: "#FFFFFF",
  border: "rgba(21,88,85,.12)", muted: "#5A7470",
  hint: "#9BB5B0", txt: "#1C2B28", green: "#22876A",
  red: "#DC2626", yellow: "#D97706", orange: "#E85D2C",
};

const RAW_EXTS = new Set(["arw","cr3","cr2","nef","raf","dng","orf","rw2","x3f","3fr","mef","mrw","pef","srw"]);

interface RawMatchRow {
  selected_jpg: string;
  selected_basename: string;
  matched_raw?: string;
  raw_extension?: string;
  status: "matched" | "raw_missing";
}

/* ════════════════════════════════════════════ */
export default function SelectGalleryDetailPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#5A7470", fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>불러오는 중...</div>}>
      <SelectGalleryDetailInner />
    </Suspense>
  );
}

function SelectGalleryDetailInner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const clientId = sp.get("clientId") ?? sp.get("client_id") ?? "";
  const workflowRunId = sp.get("workflowRunId") ?? "";

  const [gallery, setGallery] = useState<SelectGallery | null>(null);
  const [images, setImages] = useState<SelectGalleryImage[]>([]);
  const [selection, setSelection] = useState<ClientPhotoSelection | null>(null);
  const [rawMatches, setRawMatches] = useState<SelectRawMatch[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // RAW 매칭
  const [rawDir, setRawDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState("");
  const [matchLog, setMatchLog] = useState<string[]>([]);
  const hasFS = typeof window !== "undefined" && "showDirectoryPicker" in window;

  // 메일
  const [mailEmail, setMailEmail] = useState("");
  const [mailName, setMailName] = useState("");
  const [sendingMail, setSendingMail] = useState(false);
  const [mailResult, setMailResult] = useState<{ ok: boolean; msg: string } | null>(null);

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

  useEffect(() => {
    const cid = clientId || gallery?.client_id;
    if (!cid) return;
    fetch(`/api/clients/${cid}`).then(r => r.json()).then(d => {
      if (d.ok || d.client) setClient(d.client ?? d);
    });
  }, [clientId, gallery?.client_id]);

  useEffect(() => {
    if (client && !mailEmail && client.email) setMailEmail(client.email);
    if (client && !mailName && (client.manager_name || client.name)) setMailName(client.manager_name ?? client.name ?? "");
  }, [client]);

  /* ── 링크 복사 ── */
  const copyLink = () => {
    if (!gallery) return;
    const url = `${window.location.origin}/select/${gallery.share_token}`;
    navigator.clipboard.writeText(url);
    alert("셀렉 링크 복사됨:\n" + url);
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
    setMailResult({ ok: d.ok, msg: d.ok ? (d.message ?? "메일 초안이 메일링 큐에 저장되었습니다. 메일 관리에서 검토 후 발송하세요.") : (d.error ?? "오류") });
    if (d.ok) load();
  };

  /* ── RAW 폴더 선택 ── */
  const pickRawDir = async () => {
    try {
      const h = await (window as any).showDirectoryPicker({ mode: "readwrite" });
      setRawDir(h);
    } catch {}
  };

  /* ── RAW 자동 매칭 (SELECT/JPG_SELECT + SELECT/RAW_SELECT) ── */
  const runRawMatch = async () => {
    if (!rawDir || !selection || !gallery) return;
    setMatching(true);
    setMatchLog([]);
    setMatchProgress("RAW 폴더 스캔 중...");

    // 1) RAW 인덱스 빌드 (재귀, SELECT 폴더 제외)
    const rawIndex = new Map<string, { name: string; ext: string; handle: FileSystemFileHandle; dir: FileSystemDirectoryHandle }>();
    const scan = async (dir: FileSystemDirectoryHandle, depth = 0) => {
      if (depth > 6) return;
      for await (const [name, handle] of (dir as any).entries()) {
        if (name === "SELECT" || name === "Selected_RAW") continue;
        if ((handle as FileSystemHandle).kind === "directory") {
          await scan(handle as FileSystemDirectoryHandle, depth + 1);
        } else {
          const ext = name.split(".").pop()?.toLowerCase() ?? "";
          if (RAW_EXTS.has(ext)) {
            const base = name.replace(/\.[^.]+$/, "").toLowerCase();
            if (!rawIndex.has(base)) rawIndex.set(base, { name, ext, handle: handle as FileSystemFileHandle, dir });
          }
        }
      }
    };
    await scan(rawDir);
    setMatchProgress(`RAW ${rawIndex.size}개 스캔 완료. 매칭 중...`);

    // 2) 선택 JPG 핸들 수집 (RAW 폴더 내 선택 JPG 찾기 또는 images 목록 활용)
    const selectedFiles = selection.selected_files;

    // 3) 매칭 결과 계산
    const matches: RawMatchRow[] = selectedFiles.map(jpg => {
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

    const matched = matches.filter(m => m.status === "matched");
    const log: string[] = [];

    // 4) SELECT/JPG_SELECT 폴더 생성 → RAW 폴더 내에서 JPG 검색 후 복사
    try {
      const selectDir = await (rawDir as any).getDirectoryHandle("SELECT", { create: true }) as FileSystemDirectoryHandle;
      const jpgSelectDir = await (selectDir as any).getDirectoryHandle("JPG_SELECT", { create: true }) as FileSystemDirectoryHandle;
      const rawSelectDir = await (selectDir as any).getDirectoryHandle("RAW_SELECT", { create: true }) as FileSystemDirectoryHandle;

      // JPG SELECT: RAW 폴더 내 JPG 검색
      const jpgIndex = new Map<string, FileSystemFileHandle>();
      const scanJpg = async (dir: FileSystemDirectoryHandle, depth = 0) => {
        if (depth > 6) return;
        for await (const [name, handle] of (dir as any).entries()) {
          if (name === "SELECT") continue;
          if ((handle as FileSystemHandle).kind === "directory") {
            await scanJpg(handle as FileSystemDirectoryHandle, depth + 1);
          } else {
            const ext = name.split(".").pop()?.toLowerCase() ?? "";
            if (ext === "jpg" || ext === "jpeg") {
              const base = name.replace(/\.[^.]+$/, "").toLowerCase();
              if (!jpgIndex.has(base)) jpgIndex.set(base, handle as FileSystemFileHandle);
            }
          }
        }
      };
      await scanJpg(rawDir);

      let jpgCopied = 0;
      for (const jpg of selectedFiles) {
        const base = jpg.replace(/\.[^.]+$/, "").toLowerCase();
        const handle = jpgIndex.get(base);
        if (handle) {
          setMatchProgress(`JPG 복사: ${jpg} (${jpgCopied + 1}/${selectedFiles.length})`);
          try {
            const file = await handle.getFile();
            const ab = await file.arrayBuffer();
            const dest = await (jpgSelectDir as any).getFileHandle(jpg, { create: true }) as FileSystemFileHandle;
            const w = await (dest as any).createWritable(); await w.write(ab); await w.close();
            jpgCopied++; log.push(`📋 JPG: ${jpg}`);
          } catch { log.push(`❌ JPG 복사 실패: ${jpg}`); }
        } else {
          log.push(`⚠️ JPG 없음: ${jpg}`);
        }
      }

      // RAW SELECT
      let rawCopied = 0;
      for (const m of matched) {
        if (!m.matched_raw) continue;
        setMatchProgress(`RAW 복사: ${m.matched_raw} (${rawCopied + 1}/${matched.length})`);
        try {
          const rawEntry = rawIndex.get(m.selected_basename);
          if (rawEntry) {
            const file = await rawEntry.handle.getFile();
            const ab = await file.arrayBuffer();
            const dest = await (rawSelectDir as any).getFileHandle(m.matched_raw, { create: true }) as FileSystemFileHandle;
            const w = await (dest as any).createWritable(); await w.write(ab); await w.close();
            rawCopied++; log.push(`✅ RAW: ${m.matched_raw}`);
          }
        } catch { log.push(`❌ RAW 복사 실패: ${m.matched_raw}`); }
      }

      log.push(`\n📁 SELECT/JPG_SELECT/ — ${jpgCopied}장`);
      log.push(`📁 SELECT/RAW_SELECT/ — ${rawCopied}장`);
      matches.filter(m => m.status === "raw_missing").forEach(m => log.push(`⚠️ RAW 없음: ${m.selected_jpg}`));
    } catch (e: any) {
      log.push(`❌ 폴더 생성 오류: ${e.message}`);
    }

    setMatchLog(log);

    // 5) CSV 다운로드
    const csv = [
      "JPG파일명,RAW파일명,상태",
      ...matches.map(m => `${m.selected_jpg},${m.matched_raw ?? "없음"},${m.status === "matched" ? "매칭" : "RAW 없음"}`),
    ].join("\n");
    downloadText(csv, "raw_match_report.csv");

    // 6) DB 저장 + 워크플로우 retouching으로 이동
    await fetch(`/api/select-galleries/${id}/raw-match`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selection_id: selection.id, matches }),
    });

    setMatching(false);
    load();
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>불러오는 중...</div>;
  if (!gallery) return <div style={{ padding: 40, textAlign: "center", color: C.muted, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif" }}>갤러리를 찾을 수 없습니다</div>;

  const selectUrl = typeof window !== "undefined" ? `${window.location.origin}/select/${gallery.share_token}` : `/select/${gallery.share_token}`;
  const statusColor = GALLERY_STATUS_COLOR[gallery.status] ?? C.muted;
  const matchedCount = rawMatches.filter(m => m.status === "matched").length;
  const missingCount = rawMatches.filter(m => m.status === "raw_missing").length;
  const expiresDate = new Date(gallery.file_expires_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const filesExpired = new Date(gallery.file_expires_at) < new Date();

  // 현재 해야 할 일
  const todoMap: Record<string, { text: string; color: string; sub?: string }> = {
    draft:               { text: "JPG 업로드 후 브랜드메일 초안을 생성하세요", color: C.orange, sub: `${images.length}장 등록됨` },
    uploading_images:    { text: "JPG 업로드 중입니다...", color: C.orange },
    ready:               { text: "브랜드메일 초안을 생성하세요", color: C.orange, sub: `${images.length}장 등록됨` },
    mail_draft_created:  { text: "메일링 큐에서 브랜드메일을 검토·발송하세요", color: "#103A62", sub: "메일 관리 → 검토 후 발송" },
    mail_sent:           { text: "고객이 사진을 선택하기를 기다리세요", color: C.teal, sub: "셀렉 링크를 고객에게 공유하세요" },
    waiting_selection:   { text: "고객이 사진을 선택하기를 기다리세요", color: C.teal, sub: "셀렉 링크를 고객에게 공유하세요" },
    selection_submitted: { text: "고객이 선택을 완료했습니다. RAW 폴더를 선택해 주세요", color: C.orange, sub: `${gallery.selected_count}장 선택됨` },
    raw_matching:        { text: "RAW 매칭 진행 중입니다...", color: C.orange },
    raw_matched:         { text: "RAW 매칭이 완료되었습니다. 보정 작업으로 이동하세요", color: C.green, sub: `매칭 ${matchedCount}장 / 누락 ${missingCount}장` },
    retouching:          { text: "보정 진행 중입니다", color: C.teal },
    files_expired:       { text: "파일 보관 기간이 만료되어 Storage에서 삭제되었습니다", color: C.muted, sub: "선택 정보는 유지됩니다" },
    expired:             { text: "파일이 만료되었습니다", color: C.muted },
  };
  const todo = todoMap[gallery.status] ?? { text: "갤러리 상태를 확인하세요", color: C.muted };

  const backParams = new URLSearchParams();
  if (clientId) backParams.set("clientId", clientId);
  if (workflowRunId) backParams.set("workflowRunId", workflowRunId);
  const backHref = `/select-galleries?${backParams.toString()}`;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 16px", fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>

      {/* 고객 컨텍스트 배너 */}
      {(client || clientId) && (
        <div style={{ background: "#EAF4F2", border: "1.5px solid #B2D8D4", borderRadius: 10, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 2 }}>현재 고객</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.txt }}>{client?.hospital_name ?? client?.name ?? "고객 정보 로딩 중"}</div>
            {client?.manager_name && <div style={{ fontSize: 12, color: C.muted }}>{client.manager_name}</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href={`/clients?clientId=${clientId}`}
              style={{ fontSize: 12, color: C.teal, fontWeight: 700, padding: "6px 14px", border: `1px solid ${C.teal}`, borderRadius: 6, textDecoration: "none" }}>
              고객관리로
            </Link>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Link href={backHref} style={{ color: C.muted, fontSize: 20, textDecoration: "none", lineHeight: 1 }}>←</Link>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.teal }}>{gallery.shooting_name ?? gallery.title}</div>
          {gallery.hospital_name && <div style={{ fontSize: 13, color: C.muted }}>{gallery.hospital_name}</div>}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: statusColor + "20", color: statusColor }}>
          {GALLERY_STATUS_LABEL[gallery.status] ?? gallery.status}
        </span>
      </div>

      {/* 현재 해야 할 일 */}
      <div style={{ background: todo.color + "12", border: `2px solid ${todo.color}40`, borderRadius: 12, padding: "14px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: todo.color, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>현재 해야 할 일</div>
        <div style={{ fontSize: 15, fontWeight: 900, color: C.txt }}>{todo.text}</div>
        {todo.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{todo.sub}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* 갤러리 요약 + 링크 */}
        <Card title="📋 갤러리 정보">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 14 }}>
            {[
              ["총 이미지", `${gallery.total_jpg_count}장`],
              ["선택 완료", gallery.selected_count > 0 ? `${gallery.selected_count}장` : "대기 중"],
              ["파일 만료", expiresDate + (filesExpired ? " (만료됨)" : "")],
              ["촬영일", gallery.shooting_date ?? "-"],
            ].map(([l, v]) => (
              <div key={l} style={{ background: C.bg, borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{l}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: l === "파일 만료" && filesExpired ? C.red : C.txt }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={copyLink} variant="secondary">🔗 셀렉 링크 복사</Btn>
            <a href={selectUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", padding: "9px 16px", fontSize: 13, fontWeight: 700, color: C.teal, border: `1.5px solid ${C.teal}`, borderRadius: 8, textDecoration: "none" }}>
              👁 고객 화면 보기
            </a>
          </div>
        </Card>

        {/* JPG 업로드 */}
        <Card title={`📁 원본 이미지 업로드 (${images.length}장 등록됨)`}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.7 }}>
            고객이 볼 JPG 파일을 업로드합니다. 파일은 {expiresDate}에 자동 삭제됩니다.
            선택 파일명 정보는 만료 후에도 DB에 보관됩니다.
          </div>
          <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg" style={{ display: "none" }}
            onChange={e => uploadImages(e.target.files)} />
          <Btn onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "업로드 중..." : "📤 JPG 파일 업로드"}
          </Btn>
          {uploadLog.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 100, overflowY: "auto", fontFamily: "monospace", fontSize: 11, color: C.green, background: "#F0FDF4", borderRadius: 6, padding: 10 }}>
              {uploadLog.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </Card>

        {/* 브랜드메일 */}
        <Card title="📧 브랜드메일 발송">
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            셀렉 링크와 안내가 포함된 브랜드메일을 발송합니다.
            카카오톡 일반전송 금지 및 파일명 유지 안내가 포함됩니다.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input value={mailEmail} onChange={e => setMailEmail(e.target.value)} placeholder="고객 이메일" type="email"
              style={{ flex: 2, minWidth: 200, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
            <input value={mailName} onChange={e => setMailName(e.target.value)} placeholder="고객명" type="text"
              style={{ flex: 1, minWidth: 120, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={sendMail} disabled={!mailEmail || sendingMail}>
              {sendingMail ? "발송 중..." : "📧 브랜드메일 발송"}
            </Btn>
            <Btn onClick={copyLink} variant="secondary">🔗 셀렉 링크 복사</Btn>
          </div>
          {mailResult && (
            <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, background: mailResult.ok ? "#F0FDF4" : "#FFF5F5", color: mailResult.ok ? C.green : C.red, fontSize: 12 }}>
              {mailResult.msg}
            </div>
          )}
        </Card>

        {/* 고객 셀렉 결과 */}
        <Card title={`✅ 고객 셀렉 결과${selection ? ` — ${selection.selected_count}장` : ""}`}>
          {selection ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
                <InfoBadge label="선택 방식" value={selection.method === "web_select" ? "웹 선택" : "파일 업로드"} />
                <InfoBadge label="선택 사진" value={`${selection.selected_count}장`} color={C.green} />
                <InfoBadge label="제출 일시" value={new Date(selection.submitted_at).toLocaleDateString("ko-KR")} />
              </div>
              {selection.customer_memo && (
                <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400E", marginBottom: 12 }}>
                  💬 고객 메모: {selection.customer_memo}
                </div>
              )}
              <div style={{ background: C.bg, borderRadius: 8, padding: 12, maxHeight: 200, overflowY: "auto", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>선택 파일명 ({selection.selected_files.length}개)</div>
                {selection.selected_files.slice(0, 50).map((f, i) => (
                  <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: C.txt, padding: "2px 0", borderBottom: `1px solid ${C.border}` }}>{f}</div>
                ))}
                {selection.selected_files.length > 50 && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>... 외 {selection.selected_files.length - 50}개</div>}
              </div>
              <Btn onClick={() => {
                const csv = ["갤러리ID,병원명,선택방식,파일명,제출일시\n",
                  ...selection.selected_files.map(f => `${gallery.id},${gallery.hospital_name ?? ""},${selection.method},${f},${selection.submitted_at}`)
                ].join("\n");
                downloadText(csv, "selection_report.csv");
              }} variant="secondary">↓ 선택 결과 CSV</Btn>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 0", color: C.muted, fontSize: 13 }}>
              고객이 아직 사진을 선택하지 않았습니다.<br />
              <span style={{ fontSize: 12 }}>브랜드메일로 셀렉 링크를 보내세요.</span>
            </div>
          )}
        </Card>

        {/* RAW 자동 매칭 */}
        {selection && (
          <Card title="🎯 RAW 자동 매칭">
            {rawMatches.length > 0 ? (
              <div>
                <div style={{ background: C.green + "10", border: `1px solid ${C.green}40`, borderRadius: 10, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.green, marginBottom: 8 }}>✅ RAW 매칭 완료</div>
                  <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                    <span style={{ color: C.green, fontWeight: 700 }}>매칭 {matchedCount}장</span>
                    {missingCount > 0 && <span style={{ color: C.red, fontWeight: 700 }}>누락 {missingCount}장</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                    📁 SELECT/JPG_SELECT/ · 📁 SELECT/RAW_SELECT/ · 📊 raw_match_report.csv
                  </div>
                </div>
                <div style={{ background: C.bg, borderRadius: 8, padding: 10, maxHeight: 140, overflowY: "auto", fontSize: 11, fontFamily: "monospace", marginBottom: 10 }}>
                  {rawMatches.map((m, i) => (
                    <div key={i} style={{ color: m.status === "matched" ? C.green : C.red, padding: "1px 0" }}>
                      {m.status === "matched" ? "✅" : "❌"} {m.selected_jpg} → {m.matched_raw ?? "없음"}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn onClick={() => {
                    const csv = ["JPG,RAW,상태", ...rawMatches.map(m => `${m.selected_jpg},${m.matched_raw ?? "없음"},${m.status}`)].join("\n");
                    downloadText(csv, "raw_match_report.csv");
                  }} variant="secondary">↓ RAW 매칭 리포트 CSV</Btn>
                  {workflowRunId && (
                    <Btn onClick={() => {
                      const params = new URLSearchParams();
                      if (clientId) params.set("clientId", clientId);
                      if (workflowRunId) params.set("workflowRunId", workflowRunId);
                      params.set("stepKey", "retouching");
                      router.push(`/photo-retouching?${params.toString()}`);
                    }}>보정 단계로 이동 →</Btn>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.8, background: C.bg, borderRadius: 8, padding: "12px 16px" }}>
                  <strong>생성 폴더 구조:</strong><br />
                  📁 SELECT/<br />
                  &nbsp;&nbsp;├ JPG_SELECT/ — 선택된 JPG 복사<br />
                  &nbsp;&nbsp;├ RAW_SELECT/ — 매칭된 RAW 복사<br />
                  &nbsp;&nbsp;└ raw_match_report.csv<br />
                  <br />
                  <span style={{ color: C.teal, fontWeight: 700 }}>RAW 원본은 절대 삭제되지 않습니다. 복사 전용입니다.</span>
                </div>

                {!hasFS && (
                  <div style={{ background: "#FFF3CD", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#856404", marginBottom: 12 }}>
                    ⚠️ Chrome / Edge에서만 파일 시스템 접근이 가능합니다.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: matching ? 12 : 0 }}>
                  <Btn onClick={pickRawDir} variant="secondary" disabled={!hasFS}>
                    {rawDir ? `✅ 폴더: ${rawDir.name}` : "📂 RAW 폴더 선택"}
                  </Btn>
                  <Btn onClick={runRawMatch} disabled={!rawDir || matching}>
                    {matching ? "처리 중..." : "🎯 RAW 자동 매칭 시작"}
                  </Btn>
                </div>

                {matching && (
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{matchProgress}</div>
                )}
                {matchLog.length > 0 && (
                  <div style={{ maxHeight: 140, overflowY: "auto", fontFamily: "monospace", fontSize: 11, background: "#F8FFFE", borderRadius: 6, padding: 10, border: `1px solid ${C.border}` }}>
                    {matchLog.map((l, i) => (
                      <div key={i} style={{ color: l.startsWith("✅") ? C.green : l.startsWith("❌") ? C.red : l.startsWith("📁") ? C.teal : C.muted }}>{l}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── UTILS ── */
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
      <div style={{ fontSize: 13, fontWeight: 800, color: color ?? C.txt }}>{value}</div>
    </div>
  );
}

function Btn({ children, onClick, variant, disabled }: {
  children: React.ReactNode; onClick?: () => void;
  variant?: "secondary"; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: "9px 18px", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "opacity .15s",
        border: variant === "secondary" ? `1.5px solid ${C.border}` : "none",
        background: variant === "secondary" ? "transparent" : C.teal,
        color: variant === "secondary" ? C.txt : C.white }}>
      {children}
    </button>
  );
}
