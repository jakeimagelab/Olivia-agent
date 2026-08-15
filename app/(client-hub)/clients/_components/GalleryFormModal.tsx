"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export type GalleryEditSource = {
  id: string;
  hospital_name: string;
  contact_name?: string;
  contact_email?: string;
  shoot_date?: string;
  nas_link: string;
  description?: string;
  gallery_type?: string;
  client_id?: string | null;
  items?: { thumbnail_url?: string }[];
};

type ClientOption = { id: string; hospital_name?: string; name?: string };

const EMPTY = {
  hospitalName: "", contactName: "", contactEmail: "", shootDate: "",
  nasLink: "", description: "", galleryType: "final_photo", thumbnailUrl: "",
};

// 코드 요청서 2차 3번 항목(2026-08-16) — 예전 2종류(original/retouched)로 등록된 갤러리를 수정
// 화면에 불러올 때, 새 4종류 선택지 중 하나로 매핑해서 보여준다(사진/영상 구분 정보가 없던
// 과거 데이터라 기본은 "사진"으로 취급). DB에는 원래 값이 그대로 있고, 다시 저장해야 새 값으로 바뀐다.
function normalizeGalleryType(value: string | undefined): string {
  if (value === "original") return "original_photo";
  if (value === "retouched") return "final_photo";
  return value || "final_photo";
}

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
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("이미지를 처리할 수 없습니다.")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error("대표 이미지를 만들 수 없습니다.")); }, "image/webp", 0.78);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("이미지 파일을 읽을 수 없습니다.")); };
    img.src = objectUrl;
  });

type Props = {
  open: boolean;
  editSource: GalleryEditSource | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function GalleryFormModal({ open, editSource, onClose, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedClientName, setSelectedClientName] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editSource) {
      setForm({
        hospitalName: editSource.hospital_name || "",
        contactName: editSource.contact_name || "",
        contactEmail: editSource.contact_email || "",
        shootDate: editSource.shoot_date || "",
        nasLink: editSource.nas_link || "",
        description: editSource.description || "",
        galleryType: normalizeGalleryType(editSource.gallery_type),
        thumbnailUrl: editSource.items?.[0]?.thumbnail_url || "",
      });
      setSelectedClientId(editSource.client_id || "");
      setSelectedClientName(editSource.client_id ? editSource.hospital_name || "" : "");
    } else {
      setForm(EMPTY);
      setSelectedClientId("");
      setSelectedClientName("");
    }
    setThumbnailFile(null);
    setThumbnailPreview("");
    setMessage("");
  }, [open, editSource]);

  useEffect(() => {
    if (!showClientPicker) return;
    const timer = setTimeout(() => {
      fetch(`/api/clients?q=${encodeURIComponent(clientQuery)}`)
        .then((r) => r.json())
        .then((d) => { if (d.ok) setClientResults((d.clients || []).slice(0, 8)); })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [clientQuery, showClientPicker]);

  if (!open) return null;

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const pickClient = (c: ClientOption) => {
    setSelectedClientId(c.id);
    setSelectedClientName(c.hospital_name || c.name || "");
    set("hospitalName", c.hospital_name || c.name || form.hospitalName);
    setShowClientPicker(false);
    setClientQuery("");
  };

  const handleThumbnailChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("대표 이미지는 사진 파일만 선택할 수 있습니다."); return; }
    setThumbnailFile(file);
    setThumbnailPreview((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(file); });
    set("thumbnailUrl", "");
  };

  const uploadThumbnail = async () => {
    if (!thumbnailFile) return form.thumbnailUrl;
    const compressed = await compressImage(thumbnailFile);
    const payload = new FormData();
    payload.append("file", compressed, `${Date.now()}-${thumbnailFile.name.replace(/\.[^.]+$/, "")}.webp`);
    const res = await fetch("/api/gallery-thumbnail", { method: "POST", body: payload });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "대표 이미지 업로드 실패");
    return data.url as string;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.hospitalName.trim() || !form.nasLink.trim()) { setMessage("병원명과 NAS 링크는 필수입니다."); return; }
    setSaving(true);
    setMessage("");
    try {
      const uploadedThumbnailUrl = await uploadThumbnail();
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form, id: editSource?.id, thumbnailUrl: uploadedThumbnailUrl,
          client_id: selectedClientId || null, gallery_type: form.galleryType,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "저장 실패");
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="pcrm-form-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pcrm-form-modal">
        <header className="pcrm-form-modal__head">
          <h2>{editSource ? "갤러리 수정" : "촬영 갤러리 등록"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </header>
        <form onSubmit={submit} className="pcrm-form-modal__body">
          <section className="pcrm-form-section">
            <div className="pcrm-form-section__head"><strong>기본 정보</strong></div>
            <div className="pcrm-form-grid">
              <label className="pcrm-form-field"><span>병원명 *</span><input value={form.hospitalName} onChange={(e) => set("hospitalName", e.target.value)} placeholder="포토클리닉" /></label>
              <label className="pcrm-form-field"><span>촬영일</span><input type="date" value={form.shootDate} onChange={(e) => set("shootDate", e.target.value)} /></label>
              <label className="pcrm-form-field"><span>유형</span>
                <select value={form.galleryType} onChange={(e) => set("galleryType", e.target.value)}>
                  <option value="retouched">보정본</option>
                  <option value="original">원본</option>
                </select>
              </label>
              <label className="pcrm-form-field" style={{ position: "relative" }}>
                <span>고객 연결</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    flex: 1, fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: "6px 8px",
                    color: selectedClientId ? "#155855" : "#c9581a",
                    background: selectedClientId ? "rgba(21,88,85,.08)" : "rgba(232,93,44,.08)",
                  }}>
                    {selectedClientId ? `🔗 ${selectedClientName || "연결됨"}` : "⚠ 고객 미연결"}
                  </span>
                  <button type="button" className="pc-btn pc-btn--ghost pc-btn--sm" onClick={() => setShowClientPicker((v) => !v)}>{selectedClientId ? "변경" : "연결"}</button>
                </div>
                {showClientPicker && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "#fff", border: "1px solid rgba(21,88,85,.14)", borderRadius: 10, boxShadow: "0 12px 30px rgba(21,88,85,.14)", padding: 8 }}>
                    <input autoFocus value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="고객명·병원명 검색..." style={{ width: "100%", height: 34, border: "1px solid rgba(21,88,85,.14)", borderRadius: 8, padding: "0 9px", marginBottom: 6, fontSize: 12 }} />
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {clientResults.length === 0 && <div style={{ padding: 8, textAlign: "center", fontSize: 11.5, color: "#9bb5b0" }}>검색 결과 없음</div>}
                      {clientResults.map((c) => (
                        <div key={c.id} onClick={() => pickClient(c)} style={{ padding: "7px 9px", borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                          {c.hospital_name || c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </label>
            </div>
          </section>

          <section className="pcrm-form-section">
            <div className="pcrm-form-section__head"><strong>담당자 · 공유</strong></div>
            <div className="pcrm-form-grid">
              <label className="pcrm-form-field"><span>담당자</span><input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="정연호" /></label>
              <label className="pcrm-form-field"><span>공유 이메일</span><input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="photoclinic@gmail.com" /></label>
              <label className="pcrm-form-field pcrm-form-field--wide"><span>NAS 갤러리 링크 *</span><input value={form.nasLink} onChange={(e) => set("nasLink", e.target.value)} placeholder="https://nas.photoclinic.kr/share/..." /></label>
            </div>
          </section>

          <section className="pcrm-form-section">
            <div className="pcrm-form-section__head"><strong>대표 이미지 · 촬영 내용</strong></div>
            <div className="pcrm-form-grid">
              <label className="pcrm-form-field"><span>대표 이미지 업로드 (선택)</span><input type="file" accept="image/*" onChange={handleThumbnailChange} /></label>
              <label className="pcrm-form-field"><span>대표 이미지 주소 직접 입력 (선택)</span><input value={form.thumbnailUrl} onChange={(e) => set("thumbnailUrl", e.target.value)} placeholder="이미지 주소가 따로 있을 때만 입력" /></label>
              {thumbnailPreview && <img src={thumbnailPreview} alt="" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 10, gridColumn: "1 / -1" }} />}
              <label className="pcrm-form-field pcrm-form-field--wide"><span>촬영 내용</span><textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="대표원장 프로필, 상담실, 로비 공간 촬영" /></label>
            </div>
          </section>

          {message && <p className={`pcrm-form-message ${message.includes("실패") || message.includes("필수") ? "is-error" : "is-ok"}`}>{message}</p>}

          <footer className="pcrm-form-modal__footer">
            <button type="button" className="pc-btn pc-btn--ghost" onClick={onClose}>취소</button>
            <button type="submit" className="pc-btn pc-btn--orange" disabled={saving}>{saving ? "저장 중..." : editSource ? "수정 저장" : "갤러리 저장"}</button>
          </footer>
        </form>
      </div>
    </div>,
    document.body
  );
}
