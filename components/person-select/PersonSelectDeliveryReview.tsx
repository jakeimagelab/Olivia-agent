"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, Expand, ImageIcon, LoaderCircle, MessageSquareText, PackageOpen, X } from "lucide-react";
import styles from "./PersonSelectDeliveryReview.module.css";

type DeliveryItem = {
  id: string;
  group_label: string | null;
  display_name: string;
  current_version: number;
  status: "pending" | "revision_requested" | "revised" | "approved";
  customer_memo: string;
  preview_url: string;
  width: number | null;
  height: number | null;
  uploaded_at: string | null;
};

type DeliveryResponse = {
  ok: true;
  event: { title: string; retentionDays: number };
  viewer: { displayName: string; canFinalize: boolean };
  access: {
    state: "none" | "reviewing" | "revision_sent" | "approved";
    approvedAt: string | null;
    downloadedAt: string | null;
    expiresAt: string | null;
    expired: boolean;
    downloadAvailable: boolean;
  };
  items: DeliveryItem[];
};

type DownloadFile = { id: string; fileName: string; url: string };

async function readJson<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string } & Partial<T>;
  if (!response.ok || !body) throw new Error(body.error || "요청을 처리하지 못했습니다.");
  return body as T;
}

function statusLabel(status: DeliveryItem["status"]) {
  if (status === "approved") return "확인";
  if (status === "revision_requested") return "수정 요청";
  if (status === "revised") return "수정됨";
  return "확인 전";
}

export default function PersonSelectDeliveryReview({ apiBase, title, viewerName, canFinalize = true }: {
  apiBase: string;
  title: string;
  viewerName?: string;
  canFinalize?: boolean;
}) {
  const [data, setData] = useState<DeliveryResponse | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [downloadState, setDownloadState] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await readJson<DeliveryResponse>(await fetch(`${apiBase}/deliveries`, { cache: "no-store" }));
      setData(next);
      setFocusedId((current) => current && next.items.some((item) => item.id === current) ? current : next.items[0]?.id ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);
  const focused = data?.items.find((item) => item.id === focusedId) ?? null;
  useEffect(() => { setMemo(focused?.customer_memo ?? ""); }, [focused?.customer_memo, focused?.id]);

  const counts = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: items.length,
      approved: items.filter((item) => item.status === "approved").length,
      revision: items.filter((item) => item.status === "revision_requested").length,
    };
  }, [data?.items]);

  async function updateItem(action: "approve" | "request_revision") {
    if (!focused || !data || data.access.state === "approved") return;
    if (action === "request_revision" && !memo.trim()) { setError("수정 요청 내용을 적어 주세요."); return; }
    setBusy(true); setError("");
    try {
      await readJson(await fetch(`${apiBase}/deliveries/${focused.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, memo }),
      }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "검토 상태를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function submit(action: "submit_revisions" | "finalize") {
    const prompt = action === "finalize"
      ? "모든 보정본을 최종 확인할까요? 최종 확인 후에는 수정 요청을 바꿀 수 없습니다."
      : `수정 요청 ${counts.revision}장을 포토클리닉에 보낼까요?`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError("");
    try {
      await readJson(await fetch(`${apiBase}/deliveries/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "제출하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function downloadUrls() {
    return readJson<{ ok: true; files: DownloadFile[] }>(await fetch(`${apiBase}/deliveries/download-urls`, { cache: "no-store" }));
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
  }

  async function downloadOne() {
    if (!focused) return;
    setBusy(true); setError(""); setDownloadState("원본 주소를 준비하고 있어요.");
    try {
      const result = await downloadUrls();
      const file = result.files.find((item) => item.id === focused.id);
      if (!file) throw new Error("이 사진의 원본을 찾지 못했습니다.");
      const response = await fetch(file.url);
      if (!response.ok) throw new Error("원본 사진을 내려받지 못했습니다.");
      saveBlob(await response.blob(), file.fileName);
      setDownloadState("다운로드를 시작했습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "다운로드하지 못했습니다."); setDownloadState(""); }
    finally { setBusy(false); }
  }

  async function downloadZip() {
    setBusy(true); setError(""); setDownloadState("전체 보정본을 준비하고 있어요.");
    try {
      const result = await downloadUrls();
      const files: Record<string, Uint8Array> = {};
      const usedNames = new Set<string>();
      for (let index = 0; index < result.files.length; index += 1) {
        const file = result.files[index];
        setDownloadState(`${index + 1} / ${result.files.length}장 받는 중`);
        const response = await fetch(file.url);
        if (!response.ok) throw new Error(`${file.fileName} 다운로드에 실패했습니다.`);
        const dot = file.fileName.lastIndexOf(".");
        const stem = dot > 0 ? file.fileName.slice(0, dot) : file.fileName;
        const extension = dot > 0 ? file.fileName.slice(dot) : "";
        let zipName = file.fileName;
        let suffix = 2;
        while (usedNames.has(zipName.toLocaleLowerCase("ko-KR"))) zipName = `${stem} (${suffix++})${extension}`;
        usedNames.add(zipName.toLocaleLowerCase("ko-KR"));
        files[zipName] = new Uint8Array(await response.arrayBuffer());
      }
      const { zipSync } = await import("fflate");
      saveBlob(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), `${data?.event.title || title}_보정본.zip`);
      setDownloadState("전체 다운로드를 시작했습니다.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "전체 파일을 다운로드하지 못했습니다."); setDownloadState(""); }
    finally { setBusy(false); }
  }

  if (loading) return <main className={styles.statePage}><LoaderCircle className={styles.spin} /><span>보정본을 불러오는 중이에요.</span></main>;
  if (!data) return <main className={styles.statePage}><strong>{error || "보정본을 불러오지 못했습니다."}</strong><button type="button" onClick={() => void load()}>다시 시도</button></main>;
  if (!data.items.length) return <main className={styles.statePage}><PackageOpen /><h1>{data.event.title || title}</h1><strong>보정본을 준비 중입니다.</strong><span>준비가 끝나면 같은 링크에서 확인할 수 있어요.</span></main>;

  const locked = data.access.state === "approved";
  const effectiveCanFinalize = canFinalize && data.viewer.canFinalize;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p>PHOTO CLINIC · 보정본 확인</p><h1>{data.event.title || title}</h1><span>{viewerName || data.viewer.displayName}님 · 전체 {counts.total}장</span></div>
      <div className={styles.summary}><strong>{counts.approved}</strong><span>/ {counts.total}장 확인</span></div>
    </header>
    {error ? <div className={styles.error} role="alert">{error}</div> : null}
    {data.access.expired ? <div className={styles.notice}>보관 기간이 끝났습니다. 포토클리닉에 요청해 주세요.</div> : null}
    {data.access.state === "revision_sent" ? <div className={styles.notice}>수정 요청을 보냈습니다. 새 보정본이 올라오면 이 화면에서 확인할 수 있어요.</div> : null}
    <section className={styles.workspace}>
      <div className={styles.gridPane}>
        <div className={styles.grid}>{data.items.map((item) => <button key={item.id} type="button" className={styles.card} data-active={item.id === focusedId} data-status={item.status} onClick={() => setFocusedId(item.id)}>
          <span className={styles.thumb}>{item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <ImageIcon />}</span>
          <span className={styles.cardText}><strong>{item.display_name}</strong><small>{item.group_label || `v${item.current_version}`} · {statusLabel(item.status)}</small></span>
          {item.status === "approved" ? <i className={styles.approved}><Check size={13} /></i> : null}
          {item.status === "revised" ? <i className={styles.revised}>수정됨</i> : null}
        </button>)}</div>
      </div>
      <aside className={styles.previewPane}>
        <div className={styles.previewTitle}><div><span>미리보기</span><strong>{focused?.display_name}</strong></div><button type="button" aria-label="크게 보기" disabled={!focused} onClick={() => setFullscreen(true)}><Expand size={18} /></button></div>
        <div className={styles.preview}>{focused?.preview_url ? <img src={focused.preview_url} alt={focused.display_name} /> : <ImageIcon />}</div>
        {focused ? <div className={styles.reviewPanel}>
          <div className={styles.versionLine}><span>버전 v{focused.current_version}</span><b data-status={focused.status}>{statusLabel(focused.status)}</b></div>
          <label><span><MessageSquareText size={15} /> 사진별 수정 요청</span><textarea disabled={locked || busy} value={memo} maxLength={2_000} placeholder="수정할 내용을 구체적으로 적어주세요." onChange={(event) => setMemo(event.target.value)} /></label>
          {!locked ? <div className={styles.photoActions}><button type="button" disabled={busy} className={styles.revisionButton} onClick={() => void updateItem("request_revision")}>수정 요청</button><button type="button" disabled={busy} className={styles.approveButton} onClick={() => void updateItem("approve")}><Check size={16} />확인</button></div> : null}
        </div> : null}
      </aside>
    </section>
    <footer className={styles.footer}>
      <div><strong>확인 {counts.approved}장 · 수정 요청 {counts.revision}장</strong><span>{downloadState || (locked ? `최종 확인 완료${data.access.expiresAt ? ` · ${new Date(data.access.expiresAt).toLocaleDateString("ko-KR")}까지 보관` : ""}` : "사진별로 확인하거나 수정 요청을 남겨주세요.")}</span></div>
      {locked && data.access.downloadAvailable ? <div className={styles.footerActions}><button type="button" disabled={busy || !focused} onClick={() => void downloadOne()}><Download size={16} />한 장씩 저장</button><button type="button" className={styles.primary} disabled={busy} onClick={() => void downloadZip()}><PackageOpen size={16} />전체 받기</button></div> : counts.revision ? <button type="button" className={styles.primary} disabled={busy} onClick={() => void submit("submit_revisions")}>수정 요청 보내기 ({counts.revision})</button> : <button type="button" className={styles.primary} disabled={busy || counts.approved !== counts.total || !effectiveCanFinalize} title={!effectiveCanFinalize ? "최종 확정 권한이 없습니다." : ""} onClick={() => void submit("finalize")}>{effectiveCanFinalize ? "최종 확인" : "최종 확정 권한 없음"}</button>}
    </footer>
    {fullscreen && focused ? <div className={styles.fullscreen} role="dialog" aria-modal="true" onClick={() => setFullscreen(false)}><button type="button" aria-label="닫기" onClick={() => setFullscreen(false)}><X /></button><img src={focused.preview_url} alt={focused.display_name} /><span>{focused.display_name} · v{focused.current_version}</span></div> : null}
  </main>;
}
