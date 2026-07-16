"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createMailingDraft } from "@/lib/mailingQueue";

type GalleryItem = {
  id?: string;
  title: string;
  thumbnail_url?: string;
  nas_file_url?: string;
};

type Gallery = {
  id: string;
  hospital_name: string;
  contact_name?: string;
  contact_email?: string;
  shoot_date?: string;
  nas_link: string;
  description?: string;
  created_at?: string;
  items?: GalleryItem[];
};

const C = {
  teal: "#155855",
  orange: "#E85D2C",
  bg: "#EDF5F3",
  surface: "#FFFFFF",
  border: "#C8DDD9",
  muted: "#5A7470",
  hint: "#9BB5B0",
  txt: "#1C2B28",
  mint: "#EAF4F2"
};

const displayDate = (value?: string) => {
  if (!value) return "촬영일 미입력";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
};

const compressImage = (file: File) =>
  new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxSize = 1200;
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("이미지를 처리할 수 없습니다."));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("대표 이미지를 만들 수 없습니다."));
        },
        "image/webp",
        0.78
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지 파일을 읽을 수 없습니다."));
    };

    img.src = objectUrl;
  });

function GalleryPageInner() {
  const searchParams = useSearchParams();
  const clientId = searchParams.get("client_id") || searchParams.get("clientId") || "";
  const workflowRunId = searchParams.get("workflow_run_id") || searchParams.get("workflowRunId") || "";

  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [form, setForm] = useState({
    hospitalName: "",
    contactName: "",
    contactEmail: "",
    shootDate: "",
    nasLink: "",
    description: "",
    thumbnailUrl: ""
  });

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    border: `1px solid ${C.border}`,
    borderRadius: 9,
    padding: "10px 13px",
    fontSize: 13,
    fontFamily: "inherit",
    background: C.surface,
    color: C.txt,
    outline: "none"
  };

  const loadGalleries = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/galleries");
      const data = await res.json();
      if (data.ok) setGalleries(data.galleries || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGalleries();
  }, []);

  // client_id URL 파라미터로 고객 정보 자동 채움
  useEffect(() => {
    if (!clientId) return;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.ok || !d.client) return;
        const c = d.client;
        setForm(prev => ({
          ...prev,
          hospitalName: prev.hospitalName || c.name || c.hospital_name || "",
          contactName:  prev.contactName  || c.manager_name || c.contact_name || c.director_name || "",
          contactEmail: prev.contactEmail  || c.email || "",
        }));
      })
      .catch(() => {});
  }, [clientId]);

  useEffect(() => {
    const applyContext = (event: Event) => {
      const context = (event as CustomEvent<any>).detail;
      if (!context?.clientId) return;
      setForm((current) => ({
        ...current,
        hospitalName: current.hospitalName || context.hospitalName || context.clientName || "",
        contactName: current.contactName || context.contactName || "",
        contactEmail: current.contactEmail || context.email || "",
        shootDate: current.shootDate || context.shootingDate || "",
      }));
    };
    window.addEventListener("olivia-client-context", applyContext);
    return () => window.removeEventListener("olivia-client-context", applyContext);
  }, []);

  const set = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("대표 이미지는 사진 파일만 선택할 수 있습니다.");
      return;
    }

    setThumbnailFile(file);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    set("thumbnailUrl", "");
  };

  const uploadThumbnail = async () => {
    if (!thumbnailFile) return form.thumbnailUrl;

    const compressed = await compressImage(thumbnailFile);
    const payload = new FormData();
    payload.append("file", compressed, `${Date.now()}-${thumbnailFile.name.replace(/\.[^.]+$/, "")}.webp`);

    const res = await fetch("/api/gallery-thumbnail", {
      method: "POST",
      body: payload
    });
    const text = await res.text();
    const data = text.startsWith("<")
      ? { ok: false, error: "대표 이미지 업로드 API가 없습니다. app/api/gallery-thumbnail/route.ts 파일까지 배포해 주세요." }
      : text
        ? JSON.parse(text)
        : { ok: false, error: "대표 이미지 업로드 응답이 비어 있습니다." };
    if (!data.ok) throw new Error(data.error || "대표 이미지 업로드 실패");
    return data.url as string;
  };

  const resetForm = () => {
    setForm({ hospitalName: "", contactName: "", contactEmail: "", shootDate: "", nasLink: "", description: "", thumbnailUrl: "" });
    setEditingId("");
    setThumbnailFile(null);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const startEdit = (gallery: Gallery) => {
    const thumbnailUrl = gallery.items?.[0]?.thumbnail_url || "";
    setEditingId(gallery.id);
    setThumbnailFile(null);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setMessage("");
    setForm({
      hospitalName: gallery.hospital_name || "",
      contactName: gallery.contact_name || "",
      contactEmail: gallery.contact_email || "",
      shootDate: gallery.shoot_date || "",
      nasLink: gallery.nas_link || "",
      description: gallery.description || "",
      thumbnailUrl
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const uploadedThumbnailUrl = await uploadThumbnail();
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: editingId,
          thumbnailUrl: uploadedThumbnailUrl,
          client_id: clientId || null,
          workflow_run_id: workflowRunId || null,
        }),
      });
      const text = await res.text();
      const data = text.startsWith("<")
        ? { ok: false, error: "저장 API가 HTML 오류 페이지를 반환했습니다. 배포 파일을 다시 확인해 주세요." }
        : text
          ? JSON.parse(text)
          : { ok: false, error: "빈 응답이 돌아왔습니다." };
      if (!data.ok) throw new Error(data.error);
      const savedMsg = editingId ? "갤러리 카드를 수정했습니다." : "갤러리를 저장했습니다.";
      setMessage(savedMsg);
      // client_id 없을 때만 클라이언트에서 직접 메일 draft 생성 (서버에서 자동 처리되지 않는 경우)
      if (!editingId && !clientId) {
        createMailingDraft({
          type: "gallery",
          source_module: "gallery",
          hospital_name: form.hospitalName,
          contact_name: form.contactName,
          to_email: form.contactEmail,
          subject: `[포토클리닉] ${form.hospitalName} 촬영 갤러리 공유`,
          body: `${form.hospitalName} 촬영 갤러리를 공유드립니다.\n아래 NAS 링크에서 보정본을 확인하실 수 있습니다.${form.description ? "\n\n" + form.description : ""}`,
          links: form.nasLink ? [{ label: "갤러리 확인하기", url: form.nasLink }] : [],
        }).then(() => setMessage(prev => prev + " · 올리비아 메일링함에 자동 저장되었습니다."));
      } else if (!editingId && clientId) {
        setMessage(prev => prev + " · 메일링함에 draft 저장 + 워크플로우 자동 전진됩니다.");
      }
      resetForm();
      await loadGalleries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'NanumSquare', 'Noto Sans KR', sans-serif", color: C.txt }}>
      {clientId && (
        <div style={{ background: "#FFF8F5", borderBottom: `1px solid ${C.orange}30`, padding: "8px 20px", fontSize: 12, color: C.orange, fontWeight: 700 }}>
          📎 워크플로우 연결됨 — 저장 시 메일 draft 자동 생성 + 보정완료 단계 전진
        </div>
      )}
      <header className="pc-header">
        <div className="pc-header-left">
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">Gallery Delivery</span>
          </div>
        </div>
      </header>

      <section className="pc-mobile-stack" style={{ maxWidth: 1220, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "420px 1fr", gap: 22, alignItems: "start" }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>{editingId ? "갤러리 카드 편집" : "촬영 갤러리 등록"}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>원본 사진은 NAS에 두고, 카드용 작은 대표 미리보기만 저장합니다.</div>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field"><span>병원명 *</span><input style={fieldStyle} value={form.hospitalName} onChange={(e) => set("hospitalName", e.target.value)} placeholder="포토클리닉" /></label>
                <label className="field"><span>촬영일</span><input style={fieldStyle} type="date" value={form.shootDate} onChange={(e) => set("shootDate", e.target.value)} /></label>
              </div>
              <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field"><span>담당자</span><input style={fieldStyle} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="정연호" /></label>
                <label className="field"><span>공유 이메일</span><input style={fieldStyle} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="photoclnic@gmail.com" /></label>
              </div>
              <label className="field"><span>NAS 갤러리 링크 *</span><input style={fieldStyle} value={form.nasLink} onChange={(e) => set("nasLink", e.target.value)} placeholder="https://nas.photoclinic.kr/share/..." /></label>
              <label className="field">
                <span>대표 이미지 업로드 (선택)</span>
                <input style={fieldStyle} type="file" accept="image/*" onChange={handleThumbnailChange} />
                <small style={{ color: C.muted, lineHeight: 1.6 }}>원본은 저장하지 않고, 갤러리 카드용 작은 WebP 미리보기로 줄여서 저장합니다.</small>
              </label>
              {thumbnailPreview ? (
                <img src={thumbnailPreview} alt="" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}` }} />
              ) : null}
              <label className="field">
                <span>대표 이미지 주소 직접 입력 (선택)</span>
                <input style={fieldStyle} value={form.thumbnailUrl} onChange={(e) => set("thumbnailUrl", e.target.value)} placeholder="이미지 주소가 따로 있을 때만 입력" />
              </label>
              <label className="field"><span>촬영 내용</span><textarea style={{ ...fieldStyle, minHeight: 82, resize: "vertical" }} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="대표원장 프로필, 상담실, 로비 공간 촬영" /></label>
            </div>
          </div>

          <div className="pc-mobile-form-grid" style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 120px" : "1fr", gap: 10 }}>
            <button disabled={saving} className="pc-btn pc-btn--primary pc-btn--lg">
              {saving ? "저장 중..." : editingId ? "카드 수정 저장" : "갤러리 저장"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} className="pc-btn pc-btn--secondary pc-btn--lg">
                취소
              </button>
            ) : null}
          </div>
          {message ? <div style={{ color: message.includes("실패") || message.includes("없습니다") ? C.orange : C.teal, fontSize: 13, fontWeight: 800 }}>{message}</div> : null}
        </form>

        <section style={{ display: "grid", gap: 14 }}>
          <div>
            <p style={{ margin: 0, color: C.orange, fontSize: 12, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>Gallery</p>
            <h1 style={{ margin: "6px 0 0", color: C.teal, fontSize: 42, lineHeight: 1.15 }}>촬영 사진 전달 갤러리</h1>
          </div>
          {loading ? <div style={{ color: C.muted }}>불러오는 중...</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {galleries.map((gallery) => {
              const thumbnailUrl = gallery.items?.[0]?.thumbnail_url || "";
              return (
                <article key={gallery.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(21,88,85,.06)" }}>
                  {/* 썸네일 */}
                  <div style={{ position: "relative" }}>
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ aspectRatio: "16 / 9", background: `linear-gradient(135deg, ${C.mint}, #D5EAE7)`, display: "grid", placeItems: "center" }}>
                        <span style={{ fontSize: 32 }}>📷</span>
                      </div>
                    )}
                    <span style={{ position: "absolute", top: 10, left: 10, background: "rgba(21,88,85,.85)", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
                      {displayDate(gallery.shoot_date)}
                    </span>
                  </div>

                  {/* 카드 바디 */}
                  <div style={{ padding: "14px 16px" }}>
                    {/* 병원명 + 수정 버튼 */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, color: C.teal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {gallery.hospital_name}
                      </span>
                      <button type="button" onClick={() => startEdit(gallery)} className="pc-btn pc-btn--secondary pc-btn--sm" style={{ flexShrink: 0, marginLeft: 8 }}>
                        수정
                      </button>
                    </div>

                    {/* 담당자 · 이메일 */}
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
                      {gallery.contact_name || "—"} · {gallery.contact_email || "이메일 없음"}
                    </div>

                    {/* 설명 */}
                    {gallery.description && (
                      <div style={{ fontSize: 12, color: C.hint, marginBottom: 10, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {gallery.description}
                      </div>
                    )}

                    {/* NAS 링크 버튼 */}
                    <a href={gallery.nas_link} target="_blank" rel="noreferrer"
                      style={{ display: "block", textAlign: "center", padding: "8px", borderRadius: 9, background: C.mint, color: C.teal, fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                      🔗 갤러리 열기
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#5A7470" }}>불러오는 중...</div>}>
      <GalleryPageInner />
    </Suspense>
  );
}
