"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const FONT = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif";

const C = {
  teal: "#155855", bg: "#0d1117", card: "#161b22",
  border: "rgba(255,255,255,.08)", white: "#fff",
  muted: "#8b949e", green: "#22876A", red: "#f85149",
  yellow: "#d29922", purple: "#7c3aed",
};

/* ─── 목업 데이터 ─── */
const SCENES = [
  { id: "s1", name: "외래 복도" },
  { id: "s2", name: "원장실" },
  { id: "s3", name: "상담실" },
];

const MOCK_IMAGES = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `s1-${i}`, gallery_id: "demo", scene_id: "s1",
    scene_name: "외래 복도", folder_name: "Scene01_외래복도",
    original_file_name: `DSC_014${i + 1}.jpg`,
    basename: `DSC_014${i + 1}`, extension: "jpg",
    image_url: `https://picsum.photos/seed/corridor${i}/800/533`,
    thumbnail_url: `https://picsum.photos/seed/corridor${i}/400/267`,
    sort_order: i,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `s2-${i}`, gallery_id: "demo", scene_id: "s2",
    scene_name: "원장실", folder_name: "Scene02_원장실",
    original_file_name: `DSC_016${i + 1}.jpg`,
    basename: `DSC_016${i + 1}`, extension: "jpg",
    image_url: `https://picsum.photos/seed/office${i}/800/533`,
    thumbnail_url: `https://picsum.photos/seed/office${i}/400/267`,
    sort_order: 100 + i,
  })),
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `s3-${i}`, gallery_id: "demo", scene_id: "s3",
    scene_name: "상담실", folder_name: "Scene03_상담실",
    original_file_name: `DSC_018${i + 1}.jpg`,
    basename: `DSC_018${i + 1}`, extension: "jpg",
    image_url: `https://picsum.photos/seed/room${i}/800/533`,
    thumbnail_url: `https://picsum.photos/seed/room${i}/400/267`,
    sort_order: 200 + i,
  })),
];

const GALLERY = {
  id: "demo",
  title: "데모 셀렉 갤러리",
  hospital_name: "포토클리닉 데모 병원",
  shooting_name: "2025년 06월 원내 촬영",
  share_token: "demo",
  status: "waiting_selection",
  allow_web_select: true,
  allow_download_upload: true,
  allow_download_zip: false,
  allow_resubmit: true,
  total_jpg_count: MOCK_IMAGES.length,
  file_expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
  files_expired: false,
};

type GalleryImage = typeof MOCK_IMAGES[0];

/* ─── Btn ─── */
function Btn({ onClick, disabled, style, children }: { onClick?: () => void; disabled?: boolean; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ display: "block", width: "100%", padding: "12px 20px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 700, transition: "opacity .15s", opacity: disabled ? 0.4 : 1, ...style }}>
      {children}
    </button>
  );
}

/* ─── 라이트박스 ─── */
function Lightbox({ images, index, selected, onClose, onPrev, onNext, onToggle }: {
  images: GalleryImage[]; index: number; selected: Set<string>;
  onClose: () => void; onPrev: () => void; onNext: () => void;
  onToggle: (name: string) => void;
}) {
  const img = images[index];
  if (!img) return null;
  const isSel = selected.has(img.original_file_name);
  const touchX = useRef(0);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onNext();
      if (e.key === "ArrowLeft") onPrev();
      if (e.key === " ") { e.preventDefault(); onToggle(img.original_file_name); }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [img, onClose, onNext, onPrev, onToggle]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.97)", display: "flex", flexDirection: "column", fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "rgba(0,0,0,.5)", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.white, cursor: "pointer", fontSize: 22, lineHeight: 1, fontFamily: FONT }}>✕</button>
        <span style={{ fontSize: 12, color: C.muted, flex: 1 }}>{img.scene_name} / {img.original_file_name}</span>
        <span style={{ fontSize: 12, color: C.muted }}>{index + 1} / {images.length}</span>
        <button onClick={() => onToggle(img.original_file_name)}
          style={{ background: isSel ? C.teal : "rgba(255,255,255,.1)", border: `1px solid ${isSel ? C.teal : "rgba(255,255,255,.2)"}`, color: C.white, cursor: "pointer", padding: "6px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700, fontFamily: FONT }}>
          {isSel ? "✅ 선택됨" : "☐ 선택"}
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}
        onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={e => { const dx = e.changedTouches[0].clientX - touchX.current; if (dx > 60) onPrev(); else if (dx < -60) onNext(); }}>
        <button onClick={onPrev} style={{ position: "absolute", left: 8, background: "rgba(0,0,0,.5)", border: "none", color: C.white, cursor: "pointer", fontSize: 32, borderRadius: 6, padding: "8px 14px", zIndex: 10, fontFamily: FONT }}>‹</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img.image_url} alt={img.original_file_name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
        <button onClick={onNext} style={{ position: "absolute", right: 8, background: "rgba(0,0,0,.5)", border: "none", color: C.white, cursor: "pointer", fontSize: 32, borderRadius: 6, padding: "8px 14px", zIndex: 10, fontFamily: FONT }}>›</button>
      </div>
      {isSel && (
        <div style={{ background: "rgba(21,88,85,.85)", padding: "8px 16px", fontSize: 12, color: C.white, textAlign: "center", flexShrink: 0, fontFamily: FONT }}>
          ✅ 선택된 사진입니다 — 다시 누르면 선택 해제
        </div>
      )}
    </div>
  );
}

/* ─── 웹 뷰어 ─── */
function WebViewer({ onDone }: { onDone: (count: number) => void }) {
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [lightbox, setLightbox]       = useState<number | null>(null);
  const [filter, setFilter]           = useState<"all" | "selected">("all");
  const [sceneFilter, setSceneFilter] = useState("all");
  const [memo, setMemo]               = useState("");
  const [submitting, setSubmitting]   = useState(false);

  const toggle = useCallback((name: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  }, []);

  const displayed = MOCK_IMAGES.filter(img => {
    if (sceneFilter !== "all" && img.scene_name !== sceneFilter) return false;
    if (filter === "selected" && !selected.has(img.original_file_name)) return false;
    return true;
  });

  const handleSubmit = async () => {
    if (!selected.size) return;
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 800));
    setSubmitting(false);
    onDone(selected.size);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white }}>
      {/* 툴바 */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(13,17,23,.96)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${C.border}`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
          {GALLERY.shooting_name}
          <span style={{ fontSize: 10, fontWeight: 400, color: C.muted, marginLeft: 8 }}>DEMO</span>
        </span>

        <select value={sceneFilter} onChange={e => setSceneFilter(e.target.value)}
          style={{ background: C.card, border: `1px solid ${C.border}`, color: C.white, padding: "5px 8px", borderRadius: 6, fontSize: 11, fontFamily: FONT }}>
          <option value="all">전체 씬 ({MOCK_IMAGES.length})</option>
          {SCENES.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>

        <button onClick={() => setFilter(f => f === "all" ? "selected" : "all")}
          style={{ background: filter === "selected" ? C.purple : "transparent", border: `1px solid ${filter === "selected" ? C.purple : C.border}`, color: C.white, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
          {filter === "selected" ? `선택만 (${selected.size})` : `전체 (${displayed.length})`}
        </button>

        <div style={{ background: selected.size > 0 ? "rgba(21,88,85,.5)" : "rgba(255,255,255,.06)", border: `1px solid ${selected.size > 0 ? C.teal : C.border}`, color: C.white, padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700 }}>
          ✅ {selected.size}장 선택
        </div>
      </div>

      {/* 썸네일 그리드 */}
      <div style={{ padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 5 }}>
        {displayed.map((img, idx) => {
          const isSel = selected.has(img.original_file_name);
          return (
            <div key={img.id}
              style={{ position: "relative", aspectRatio: "3/2", borderRadius: 6, overflow: "hidden", border: `2px solid ${isSel ? C.teal : "transparent"}`, cursor: "pointer", transition: "border-color .1s" }}
              onClick={() => setLightbox(idx)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.thumbnail_url} alt={img.original_file_name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <div style={{ position: "absolute", top: 5, left: 5 }}
                onClick={e => { e.stopPropagation(); toggle(img.original_file_name); }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${isSel ? C.teal : "rgba(255,255,255,.6)"}`, background: isSel ? C.teal : "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.white, fontWeight: 700 }}>
                  {isSel ? "✓" : ""}
                </div>
              </div>
              <div style={{ position: "absolute", top: 4, right: 4 }}>
                <span style={{ fontSize: 8, background: "rgba(0,0,0,.55)", color: "rgba(255,255,255,.7)", borderRadius: 3, padding: "2px 4px" }}>{img.scene_name}</span>
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,.7))", padding: "12px 5px 3px", fontSize: 9, color: "rgba(255,255,255,.65)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {img.original_file_name}
              </div>
            </div>
          );
        })}
      </div>

      {/* 하단 제출 */}
      <div style={{ position: "sticky", bottom: 0, background: "rgba(13,17,23,.96)", backdropFilter: "blur(8px)", borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="보정 메모 (선택사항) — 예: 자연스럽게, 원장님 웃는 컷 위주로"
          rows={2} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontSize: 12, padding: "8px 12px", resize: "none", fontFamily: FONT, width: "100%", boxSizing: "border-box" }} />
        <Btn onClick={handleSubmit} disabled={selected.size === 0 || submitting}
          style={{ background: selected.size > 0 ? C.teal : "rgba(255,255,255,.08)", color: C.white, fontWeight: 800, fontSize: 14, padding: "13px" }}>
          {submitting ? "제출 중..." : selected.size > 0 ? `✅ ${selected.size}장 선택 완료 — 제출하기` : "사진을 선택하세요"}
        </Btn>
        <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>스페이스바: 선택/해제 · 방향키: 이전/다음 · ESC: 닫기</div>
      </div>

      {lightbox !== null && (
        <Lightbox
          images={displayed} index={lightbox} selected={selected}
          onClose={() => setLightbox(null)}
          onPrev={() => setLightbox(v => Math.max(0, (v ?? 0) - 1))}
          onNext={() => setLightbox(v => Math.min(displayed.length - 1, (v ?? 0) + 1))}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

/* ─── 홈 화면 ─── */
function HomeScreen({ onWebSelect, onUpload }: { onWebSelect: () => void; onUpload: () => void }) {
  const expiresDate = new Date(GALLERY.file_expires_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white }}>
      <header style={{ background: C.teal, padding: "20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginBottom: 3 }}>포토클리닉 — 데모 모드</div>
        <div style={{ fontSize: 19, fontWeight: 900 }}>📸 {GALLERY.shooting_name}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.75)", marginTop: 3 }}>{GALLERY.hospital_name}</div>
      </header>

      <div style={{ maxWidth: 540, margin: "0 auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "18px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 5 }}>보정할 사진을 선택해주세요</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
            총 <strong style={{ color: C.white }}>{GALLERY.total_jpg_count}장</strong>의 원본 사진이 준비되어 있습니다.
          </div>
        </div>

        <div style={{ background: "rgba(242,163,38,.08)", border: "1px solid rgba(242,163,38,.28)", borderRadius: 10, padding: "13px 16px", fontSize: 12, color: "#d29922", lineHeight: 1.8 }}>
          ⚠️ <strong>카카오톡으로 사진을 그냥 보내시면 파일명·화질·데이터가 변경</strong>될 수 있습니다.<br />
          파일명은 절대 변경하지 말아주세요.<br />
          사진 파일은 보안상 <strong>{expiresDate}까지만</strong> 보관됩니다.
        </div>

        {/* 방법 1 */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>방법 1. 웹에서 바로 선택하기</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              사진을 웹에서 크게 보고 체크하실 수 있습니다.<br />파일을 다시 보내실 필요가 없습니다.
            </div>
          </div>
          <div style={{ padding: "14px 22px" }}>
            <Btn onClick={onWebSelect} style={{ background: C.teal, color: C.white }}>🖥 웹에서 선택하기</Btn>
          </div>
        </div>

        {/* 방법 2 */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>방법 2. 다운로드 후 선택 JPG 업로드</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
              전체 JPG를 다운로드한 뒤 컴퓨터에서 확인하고<br />보정할 파일만 다시 업로드해주세요.
            </div>
          </div>
          <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "block", background: "rgba(21,88,85,.2)", color: C.white, border: `1px solid ${C.teal}`, padding: "11px 16px", borderRadius: 8, textAlign: "center", fontSize: 13, fontWeight: 700 }}>
              📦 전체 JPG 다운로드 ({GALLERY.total_jpg_count}장) — 데모에서는 비활성
            </div>
            <Btn onClick={onUpload} style={{ background: C.purple, color: C.white }}>⬆ 선택한 JPG 업로드하기</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── 완료 화면 ─── */
function DoneScreen({ count, onReset }: { count: number; onReset: () => void }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT, color: C.white, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>선택이 완료되었습니다!</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 28 }}>
          총 <strong style={{ color: C.white }}>{count}장</strong>이 선택되었습니다.<br />
          보정 작업이 완료되면 별도로 연락드리겠습니다.
        </div>
        <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: 20, fontSize: 12, color: C.muted, textAlign: "left" }}>
          <div style={{ fontWeight: 700, color: C.white, marginBottom: 6 }}>선택 정보</div>
          <div>선택 방법: 웹 선택</div>
          <div>선택 수량: {count}장</div>
          <div>제출 시각: {new Date().toLocaleString("ko-KR")}</div>
        </div>
        <button onClick={onReset}
          style={{ background: "rgba(255,255,255,.08)", border: `1px solid ${C.border}`, color: C.muted, padding: "10px 24px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: FONT }}>
          ← 처음으로 (데모 재시작)
        </button>
      </div>
    </div>
  );
}

/* ─── 메인 ─── */
export default function SelectDemoPage() {
  const [view, setView] = useState<"home" | "web" | "upload" | "done">("home");
  const [doneCount, setDoneCount] = useState(0);

  if (view === "web") return <WebViewer onDone={n => { setDoneCount(n); setView("done"); }} />;
  if (view === "done") return <DoneScreen count={doneCount} onReset={() => setView("home")} />;

  return <HomeScreen onWebSelect={() => setView("web")} onUpload={() => setView("upload")} />;
}
