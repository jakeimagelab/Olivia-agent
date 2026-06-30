"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

/* ══════════════════════════
   TYPES
══════════════════════════ */
interface GalleryInfo {
  id: string; title: string; hospital_name?: string;
  shooting_name?: string; shooting_date?: string;
  share_token: string; status: string;
  allow_web_select: boolean; allow_download_upload: boolean;
  allow_download_zip: boolean; allow_resubmit: boolean;
  total_jpg_count: number; file_expires_at: string; files_expired: boolean;
}
interface GalleryImage {
  id: string; gallery_id: string;
  original_file_name: string; basename: string; extension: string;
  scene_name?: string; folder_name?: string;
  image_url: string; thumbnail_url?: string;
  sort_order: number;
}

/* ══════════════════════════
   THEME
══════════════════════════ */
const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";

const C = {
  teal: "#155855", bg: "#0d1117", card: "#161b22",
  border: "rgba(255,255,255,.08)", white: "#fff",
  muted: "#8b949e", green: "#22876A", red: "#f85149",
  yellow: "#d29922", purple: "#7c3aed",
};

/* ══════════════════════════
   MAIN PAGE
══════════════════════════ */
export default function SelectPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [gallery, setGallery] = useState<GalleryInfo | null>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selection, setSelection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"home" | "web" | "upload" | "done">("home");

  useEffect(() => {
    fetch(`/api/select/${shareToken}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok) { setError(d.error ?? "오류가 발생했습니다"); }
        else { setGallery(d.gallery); setImages(d.images ?? []); setSelection(d.selection); }
      })
      .catch(() => setError("네트워크 오류가 발생했습니다"))
      .finally(() => setLoading(false));
  }, [shareToken]);

  if (loading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!gallery) return <ErrorScreen message="링크를 찾을 수 없습니다" />;

  if (selection && !gallery.allow_resubmit && view !== "done")
    return <AlreadyDoneScreen gallery={gallery} selection={selection} />;

  if (view === "web") return (
    <WebViewerPage
      gallery={gallery} images={images}
      onBack={() => setView("home")}
      onDone={(sel) => { setSelection(sel); setView("done"); }}
    />
  );
  if (view === "upload") return (
    <UploadPage
      gallery={gallery}
      onBack={() => setView("home")}
      onDone={(sel) => { setSelection(sel); setView("done"); }}
    />
  );
  if (view === "done") return (
    <DoneScreen gallery={gallery} selection={selection} onResubmit={gallery.allow_resubmit ? () => { setSelection(null); setView("home"); } : undefined} />
  );

  return (
    <HomeScreen
      gallery={gallery}
      onWebSelect={() => setView("web")}
      onUpload={() => setView("upload")}
    />
  );
}

/* ══════════════════════════
   HOME SCREEN
══════════════════════════ */
function HomeScreen({ gallery, onWebSelect, onUpload }: {
  gallery: GalleryInfo;
  onWebSelect: () => void;
  onUpload: () => void;
}) {
  const expiresDate = new Date(gallery.file_expires_at).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white }}>
      <header style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)", marginBottom: 4 }}>포토클리닉</div>
        <div style={{ fontSize: 20, fontWeight: 900 }}>📸 {gallery.shooting_name ?? gallery.title}</div>
        {gallery.hospital_name && <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginTop: 4 }}>{gallery.hospital_name}</div>}
      </header>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "20px 24px" }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>보정할 사진을 선택해주세요</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
            총 <strong style={{ color: C.white }}>{gallery.total_jpg_count}장</strong>의 원본 사진이 준비되어 있습니다.<br />
            아래 방법 중 하나를 선택해 보정할 사진을 골라주세요.
          </div>
        </div>

        {/* 경고 배너 */}
        <div style={{ background: "rgba(242,163,38,.08)", border: "1px solid rgba(242,163,38,.3)", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: "#d29922", lineHeight: 1.8 }}>
          ⚠️ <strong>카카오톡으로 사진을 그냥 보내시면 파일명·화질·데이터가 변경</strong>될 수 있습니다.<br />
          RAW 원본 매칭을 위해 파일명은 절대 변경하지 말아주세요.<br />
          사진 파일은 보안상 <strong>{expiresDate}까지만</strong> 보관됩니다.
        </div>

        {/* 방법 1 */}
        {gallery.allow_web_select && !gallery.files_expired && (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>방법 1. 웹에서 바로 선택하기</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                사진을 웹에서 크게 보고 체크하실 수 있습니다.<br />
                파일을 다시 보내실 필요가 없습니다.
              </div>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <Btn onClick={onWebSelect} style={{ background: C.teal, color: C.white, width: "100%" }}>
                🖥 웹에서 선택하기
              </Btn>
            </div>
          </div>
        )}

        {/* 방법 2 */}
        {gallery.allow_download_upload && (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>방법 2. 다운로드 후 선택 JPG 업로드</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                전체 JPG를 다운로드한 뒤 컴퓨터에서 직접 확인하고<br />
                보정할 JPG 파일만 다시 업로드해주세요.
              </div>
            </div>
            <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
              {gallery.allow_download_zip && !gallery.files_expired && (
                <a
                  href={`/api/select-galleries/${gallery.id}/download-zip?token=${gallery.share_token}`}
                  style={{ display: "block", background: "rgba(21,88,85,.2)", color: C.white, border: `1px solid ${C.teal}`, padding: "11px 16px", borderRadius: 8, textAlign: "center", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
                >
                  📦 전체 JPG 다운로드 ({gallery.total_jpg_count}장)
                </a>
              )}
              <Btn onClick={onUpload} style={{ background: C.purple, color: C.white }}>
                ⬆ 선택한 JPG 업로드하기
              </Btn>
            </div>
          </div>
        )}

        {gallery.files_expired && (
          <div style={{ background: "rgba(248,81,73,.08)", border: "1px solid rgba(248,81,73,.3)", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: C.red }}>
            파일 보관 기간이 만료되었습니다. 웹 뷰어를 이용하실 수 없습니다.<br />
            다운로드 후 업로드 방식으로 선택해주세요.
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════
   WEB VIEWER PAGE
══════════════════════════ */
function WebViewerPage({ gallery, images, onBack, onDone }: {
  gallery: GalleryInfo;
  images: GalleryImage[];
  onBack: () => void;
  onDone: (sel: any) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "selected">("all");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sceneFilter, setSceneFilter] = useState<string>("all");
  const [zoom, setZoom] = useState(1);

  const scenes = Array.from(new Set(images.map(i => i.scene_name ?? i.folder_name ?? ""))).filter(Boolean);
  const displayed = images.filter(img => {
    if (sceneFilter !== "all") {
      const sc = img.scene_name ?? img.folder_name ?? "";
      if (sc !== sceneFilter) return false;
    }
    if (filter === "selected" && !selected.has(img.original_file_name)) return false;
    return true;
  });

  const toggle = (name: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });

  // 키보드 단축키
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setLightbox(v => v !== null ? Math.min(v + 1, displayed.length - 1) : null);
      if (e.key === "ArrowLeft")  setLightbox(v => v !== null ? Math.max(v - 1, 0) : null);
      if (e.key === " ") { e.preventDefault(); if (lightbox !== null) toggle(displayed[lightbox].original_file_name); }
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightbox, displayed]);

  const submit = async () => {
    if (!selected.size) return;
    setSubmitting(true);
    const res = await fetch(`/api/select-galleries/${gallery.id}/submit-web-select`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_files: Array.from(selected), customer_memo: memo, share_token: gallery.share_token }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (d.ok) onDone(d.selection);
    else alert("오류: " + d.error);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white }}>
      {/* 상단 툴바 */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(13,17,23,.95)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "0 4px" }}>←</button>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {gallery.shooting_name ?? gallery.title}
        </span>
        {scenes.length > 0 && (
          <select value={sceneFilter} onChange={e => setSceneFilter(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, color: C.white, padding: "5px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>
            <option value="all">전체 씬</option>
            {scenes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button onClick={() => setFilter(f => f === "all" ? "selected" : "all")}
          style={{ background: filter === "selected" ? C.purple : "transparent", border: `1px solid ${filter === "selected" ? C.purple : C.border}`, color: C.white, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {filter === "selected" ? `선택만 (${selected.size})` : `전체 (${images.length})`}
        </button>
        <div style={{ background: selected.size > 0 ? C.teal : "rgba(255,255,255,.06)", border: `1px solid ${selected.size > 0 ? C.teal : C.border}`, color: C.white, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
          ✅ {selected.size}장 선택
        </div>
      </div>

      {/* 썸네일 그리드 */}
      <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 6 }}>
        {displayed.map((img, idx) => {
          const isSel = selected.has(img.original_file_name);
          return (
            <div key={img.id} style={{ position: "relative", aspectRatio: "3/2", borderRadius: 6, overflow: "hidden", border: `2px solid ${isSel ? C.teal : "transparent"}`, cursor: "pointer" }}
              onClick={() => setLightbox(idx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumbnail_url ?? img.image_url} alt={img.original_file_name}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {/* 선택 체크박스 */}
              <div style={{ position: "absolute", top: 6, left: 6 }}
                onClick={e => { e.stopPropagation(); toggle(img.original_file_name); }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${isSel ? C.teal : "rgba(255,255,255,.6)"}`, background: isSel ? C.teal : "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.white }}>
                  {isSel && "✓"}
                </div>
              </div>
              {/* 파일명 */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,.7))", padding: "14px 6px 4px", fontSize: 9, color: "rgba(255,255,255,.7)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {img.original_file_name}
              </div>
            </div>
          );
        })}
        {displayed.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: 14 }}>
            {filter === "selected" ? "아직 선택한 사진이 없습니다" : "사진이 없습니다"}
          </div>
        )}
      </div>

      {/* 하단 제출 버튼 */}
      <div style={{ position: "sticky", bottom: 0, background: "rgba(13,17,23,.95)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="보정 메모 (선택사항) — 예: 자연스럽게 부탁드립니다"
          rows={2} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 12, padding: "8px 12px", resize: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />
        <Btn onClick={submit} disabled={selected.size === 0 || submitting}
          style={{ background: selected.size > 0 ? C.teal : "rgba(255,255,255,.08)", color: C.white, fontWeight: 800, fontSize: 15, padding: "14px" }}>
          {submitting ? "제출 중..." : `✅ ${selected.size}장 선택 완료`}
        </Btn>
        <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          스페이스바: 현재 사진 선택/해제 · 방향키: 이전/다음 · ESC: 닫기
        </div>
      </div>

      {/* 라이트박스 */}
      {lightbox !== null && (
        <Lightbox
          images={displayed} index={lightbox}
          selected={selected}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(v => Math.max(0, (v ?? 0) - 1))}
          onNext={() => setLightbox(v => Math.min(displayed.length - 1, (v ?? 0) + 1))}
          onToggle={(name) => toggle(name)}
          zoom={zoom} setZoom={setZoom}
        />
      )}
    </div>
  );
}

/* ══════════════════════════
   LIGHTBOX
══════════════════════════ */
function Lightbox({ images, index, selected, onClose, onPrev, onNext, onToggle, zoom, setZoom }: {
  images: GalleryImage[]; index: number; selected: Set<string>;
  onClose: () => void; onPrev: () => void; onNext: () => void;
  onToggle: (name: string) => void; zoom: number; setZoom: (v: number) => void;
}) {
  const img = images[index];
  if (!img) return null;
  const isSel = selected.has(img.original_file_name);

  // 터치 스와이프
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 60) onPrev(); else if (dx < -60) onNext();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.96)", display: "flex", flexDirection: "column" }}
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* 상단바 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(0,0,0,.6)", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.white, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>✕</button>
        <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{img.original_file_name}</span>
        <span style={{ fontSize: 12, color: C.muted }}>{index + 1} / {images.length}</span>
        <button onClick={() => setZoom(zoom === 1 ? 2 : 1)} style={{ background: "rgba(255,255,255,.1)", border: "none", color: C.white, cursor: "pointer", padding: "5px 10px", borderRadius: 6, fontSize: 12 }}>
          {zoom === 1 ? "🔍 확대" : "🔍 원래"}
        </button>
        <button onClick={() => onToggle(img.original_file_name)}
          style={{ background: isSel ? C.teal : "rgba(255,255,255,.1)", border: `1px solid ${isSel ? C.teal : "rgba(255,255,255,.2)"}`, color: C.white, cursor: "pointer", padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
          {isSel ? "✅ 선택됨" : "☐ 선택"}
        </button>
      </div>
      {/* 이미지 */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto", position: "relative" }}>
        <button onClick={onPrev} style={{ position: "absolute", left: 8, background: "rgba(0,0,0,.4)", border: "none", color: C.white, cursor: "pointer", fontSize: 28, borderRadius: 6, padding: "8px 12px", zIndex: 10 }}>‹</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.image_url} alt={img.original_file_name}
          style={{ maxWidth: zoom === 1 ? "100%" : "none", maxHeight: zoom === 1 ? "100%" : "none", width: zoom === 2 ? "auto" : undefined, objectFit: "contain", transition: "transform .2s", display: "block" }} />
        <button onClick={onNext} style={{ position: "absolute", right: 8, background: "rgba(0,0,0,.4)", border: "none", color: C.white, cursor: "pointer", fontSize: 28, borderRadius: 6, padding: "8px 12px", zIndex: 10 }}>›</button>
      </div>
      {/* 선택 상태 표시줄 */}
      {isSel && (
        <div style={{ background: "rgba(21,88,85,.8)", padding: "8px 16px", fontSize: 12, color: C.white, textAlign: "center", flexShrink: 0 }}>
          ✅ 이 사진이 선택되어 있습니다 — 다시 누르면 선택 해제
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════
   UPLOAD PAGE
══════════════════════════ */
function UploadPage({ gallery, onBack, onDone }: {
  gallery: GalleryInfo;
  onBack: () => void;
  onDone: (sel: any) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [memo, setMemo] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const allowed = ["jpg","jpeg","heic","heif","tif","tiff","png"];
    const valid = Array.from(newFiles).filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      return allowed.includes(ext);
    });
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !names.has(f.name))];
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!files.length) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.append("share_token", gallery.share_token);
    fd.append("customer_memo", memo);
    files.forEach(f => fd.append("files", f));
    const res = await fetch(`/api/select-galleries/${gallery.id}/upload-selected`, { method: "POST", body: fd });
    const d = await res.json();
    setSubmitting(false);
    if (d.ok) onDone(d.selection);
    else alert("오류: " + d.error);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white }}>
      <div style={{ background: C.teal, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.white, cursor: "pointer", fontSize: 22, lineHeight: 1 }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 800 }}>선택한 JPG 업로드</span>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ background: "rgba(242,163,38,.08)", border: "1px solid rgba(242,163,38,.3)", borderRadius: 10, padding: "14px 18px", fontSize: 12, color: "#d29922", lineHeight: 1.8 }}>
          ⚠️ 컴퓨터에서 보정받을 JPG 파일만 선택해서 업로드해주세요.<br />
          파일명을 변경하면 RAW 매칭이 어려울 수 있습니다.
        </div>

        {/* 드래그 앤 드롭 영역 */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${dragging ? C.teal : C.border}`, borderRadius: 12, padding: "48px 24px", textAlign: "center", cursor: "pointer", background: dragging ? "rgba(21,88,85,.1)" : C.card, transition: "all .2s" }}>
          <input ref={inputRef} type="file" multiple accept=".jpg,.jpeg,.heic,.heif,.tif,.tiff,.png"
            style={{ display: "none" }} onChange={e => addFiles(e.target.files)} />
          <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>파일을 여기에 드래그하거나 클릭해서 선택</div>
          <div style={{ fontSize: 12, color: C.muted }}>JPG, JPEG, HEIC, TIFF, PNG 파일 지원</div>
        </div>

        {/* 파일 목록 */}
        {files.length > 0 && (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>선택된 파일 {files.length}개</span>
              <button onClick={() => setFiles([])} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>전체 삭제</button>
            </div>
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="보정 메모 (선택사항) — 예: 자연스럽게 부탁드립니다"
          rows={3} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 13, padding: "10px 14px", resize: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" }} />

        <Btn onClick={submit} disabled={files.length === 0 || submitting}
          style={{ background: files.length > 0 ? C.teal : "rgba(255,255,255,.08)", color: C.white, fontWeight: 800, fontSize: 15, padding: "14px" }}>
          {submitting ? "업로드 중..." : `✅ ${files.length}개 파일로 선택 완료`}
        </Btn>
      </div>
    </div>
  );
}

/* ══════════════════════════
   DONE / ALREADY DONE
══════════════════════════ */
function DoneScreen({ gallery, selection, onResubmit }: { gallery: GalleryInfo; selection: any; onResubmit?: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 60, marginBottom: 20 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>선택이 완료되었습니다!</div>
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 24, lineHeight: 1.7 }}>
          총 <strong style={{ color: C.white }}>{selection?.selected_count ?? 0}장</strong>의 사진이 선택되었습니다.<br />
          보정 작업이 완료되면 별도로 연락드리겠습니다.
        </div>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 20px", textAlign: "left", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>선택 정보</div>
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>선택 방식: <strong>{selection?.method === "web_select" ? "웹 선택" : "파일 업로드"}</strong></div>
            <div>선택 사진: <strong>{selection?.selected_count}장</strong></div>
            {selection?.customer_memo && <div>메모: <strong>{selection.customer_memo}</strong></div>}
          </div>
        </div>
        {onResubmit && (
          <Btn onClick={onResubmit} style={{ background: "rgba(255,255,255,.08)", color: C.muted, fontSize: 13 }}>
            다시 선택하기
          </Btn>
        )}
      </div>
    </div>
  );
}

function AlreadyDoneScreen({ gallery, selection }: { gallery: GalleryInfo; selection: any }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>이미 선택이 완료되었습니다</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7 }}>
          <strong style={{ color: C.white }}>{selection.selected_count}장</strong>이 선택되었습니다.<br />
          보정 완료 시 연락드리겠습니다. 감사합니다.
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════
   UTILITY COMPONENTS
══════════════════════════ */
function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.muted, fontSize: 14 }}>
      사진을 불러오는 중...
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, fontFamily: FONT, color: C.white, padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>🔗</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>링크를 찾을 수 없습니다</div>
      <div style={{ fontSize: 13, color: C.muted }}>{message}</div>
    </div>
  );
}

function Btn({ children, onClick, disabled, style }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "block", width: "100%", padding: "12px 20px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 700, transition: "opacity .15s", opacity: disabled ? 0.4 : 1, ...style }}>
      {children}
    </button>
  );
}
