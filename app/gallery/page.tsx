"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";

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

export default function GalleryPage() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharingId, setSharingId] = useState("");
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
    const data = await res.json();
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
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingId, thumbnailUrl: uploadedThumbnailUrl })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessage(editingId ? "갤러리 카드를 수정했습니다." : "갤러리를 저장했습니다.");
      resetForm();
      await loadGalleries();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const shareGallery = async (gallery: Gallery) => {
    if (!gallery.contact_email) {
      setMessage("공유할 이메일이 없습니다.");
      return;
    }
    setSharingId(gallery.id);
    setMessage("");
    const firstImage = gallery.items?.[0]?.thumbnail_url || "";
    try {
      const res = await fetch("/api/send-gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: gallery.contact_email,
          toName: gallery.contact_name,
          hospitalName: gallery.hospital_name,
          nasLink: gallery.nas_link,
          shootDate: gallery.shoot_date,
          description: gallery.description,
          thumbnailUrl: firstImage
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setMessage(`${gallery.hospital_name}에 갤러리 메일을 보냈습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "메일 발송 실패");
    } finally {
      setSharingId("");
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Noto Sans KR', sans-serif", color: C.txt }}>
      <header className="pc-header">
        <div className="pc-header-left">
          <Link href="/" className="pc-header-back">← 관리자 홈</Link>
          <div className="pc-header-divider" />
          <div className="pc-header-brand">
            <img src="https://photoclinic-diangnoisis.vercel.app/logo.svg" alt="포토클리닉" className="pc-header-logo" />
            <span className="pc-header-title">Gallery Delivery</span>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1220, margin: "0 auto", padding: "28px 20px", display: "grid", gridTemplateColumns: "420px 1fr", gap: 22, alignItems: "start" }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ background: C.mint, padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.teal }}>{editingId ? "갤러리 카드 편집" : "촬영 갤러리 등록"}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>원본 사진은 NAS에 두고, 카드용 작은 대표 미리보기만 저장합니다.</div>
            </div>
            <div style={{ padding: 20, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field"><span>병원명 *</span><input style={fieldStyle} value={form.hospitalName} onChange={(e) => set("hospitalName", e.target.value)} placeholder="온유성형외과" /></label>
                <label className="field"><span>촬영일</span><input style={fieldStyle} type="date" value={form.shootDate} onChange={(e) => set("shootDate", e.target.value)} /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="field"><span>담당자</span><input style={fieldStyle} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="김실장님" /></label>
                <label className="field"><span>공유 이메일</span><input style={fieldStyle} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="client@hospital.com" /></label>
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

          <div style={{ display: "grid", gridTemplateColumns: editingId ? "1fr 120px" : "1fr", gap: 10 }}>
            <button disabled={saving} style={{ minHeight: 50, border: 0, borderRadius: 12, background: C.teal, color: "#fff", fontWeight: 900, fontSize: 15 }}>
              {saving ? "저장 중..." : editingId ? "카드 수정 저장" : "갤러리 저장"}
            </button>
            {editingId ? (
              <button type="button" onClick={resetForm} style={{ minHeight: 50, border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface, color: C.teal, fontWeight: 900, fontSize: 14 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {galleries.map((gallery) => {
              const thumbnailUrl = gallery.items?.[0]?.thumbnail_url || "";
              const canSendMail = Boolean(gallery.contact_email);
              return (
                <article key={gallery.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 14px 34px rgba(21,88,85,.08)" }}>
                  <div style={{ position: "relative", background: C.border }}>
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt="" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ aspectRatio: "16 / 10", background: `linear-gradient(135deg, ${C.mint}, #DDEDEA)`, display: "grid", placeItems: "center", color: C.teal, fontSize: 13, fontWeight: 800 }}>
                        대표 이미지 없음
                      </div>
                    )}
                    <div style={{ position: "absolute", left: 12, top: 12, background: "rgba(255,255,255,.92)", color: C.teal, borderRadius: 999, padding: "6px 10px", fontSize: 11, fontWeight: 900 }}>
                      {displayDate(gallery.shoot_date)}
                    </div>
                  </div>
                  <div style={{ padding: 16, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                      <div style={{ minWidth: 0 }}>
                        <h2 style={{ margin: 0, color: C.teal, fontSize: 20, fontWeight: 900, lineHeight: 1.25 }}>{gallery.hospital_name}</h2>
                        <p style={{ margin: "6px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
                          {gallery.contact_name || "담당자 미입력"} · {gallery.contact_email || "이메일 미입력"}
                        </p>
                      </div>
                      <div style={{ display: "grid", gap: 7, justifyItems: "end" }}>
                        <button
                          type="button"
                          onClick={() => shareGallery(gallery)}
                          disabled={!canSendMail || sharingId === gallery.id}
                          title={canSendMail ? "갤러리 메일 보내기" : "공유 이메일을 먼저 입력하세요"}
                          style={{
                            border: 0,
                            borderRadius: 10,
                            background: canSendMail ? C.orange : C.border,
                            color: canSendMail ? "#fff" : C.muted,
                            padding: "9px 11px",
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            cursor: canSendMail ? "pointer" : "not-allowed"
                          }}
                        >
                          {sharingId === gallery.id ? "발송 중" : "메일 보내기"}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(gallery)}
                          style={{
                            border: `1px solid ${C.border}`,
                            borderRadius: 10,
                            background: C.surface,
                            color: C.teal,
                            padding: "8px 11px",
                            fontSize: 12,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            cursor: "pointer"
                          }}
                        >
                          카드 수정
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: C.mint, borderRadius: 10, padding: "10px 11px" }}>
                        <div style={{ color: C.hint, fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>SHOOT DATE</div>
                        <div style={{ color: C.teal, fontSize: 12, fontWeight: 900, marginTop: 4 }}>{displayDate(gallery.shoot_date)}</div>
                      </div>
                      <div style={{ background: C.mint, borderRadius: 10, padding: "10px 11px" }}>
                        <div style={{ color: C.hint, fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>PREVIEW</div>
                        <div style={{ color: C.teal, fontSize: 12, fontWeight: 900, marginTop: 4 }}>{thumbnailUrl ? "대표 이미지 연결" : "대표 이미지 없음"}</div>
                      </div>
                    </div>

                    <p style={{ margin: 0, color: C.muted, fontSize: 13, lineHeight: 1.65 }}>{gallery.description || "촬영 갤러리"}</p>
                    <a href={gallery.nas_link} target="_blank" rel="noreferrer" style={{ color: C.orange, fontSize: 12, fontWeight: 900, textDecoration: "none" }}>NAS 링크 열기 →</a>
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
