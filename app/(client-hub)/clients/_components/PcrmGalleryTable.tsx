"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Images, Pencil, Plus } from "lucide-react";
import { C, R } from "@/lib/theme";
import GalleryFormModal, { type GalleryEditSource } from "./GalleryFormModal";

type Gallery = {
  id: string;
  hospital_name: string;
  contact_name?: string;
  contact_email?: string;
  shoot_date?: string;
  nas_link: string;
  description?: string;
  gallery_type?: string;
  client_id?: string | null;
  created_at?: string;
  items?: { thumbnail_url?: string }[];
  publication?: { status: string } | null;
};

const cardStyle: React.CSSProperties = { background: C.white, border: `1px solid ${C.border}`, borderRadius: R.lg, boxShadow: "0 5px 18px rgba(21,88,85,.055)" };
const TYPE_LABEL: Record<string, string> = { retouched: "보정본", original: "원본" };

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function toCsvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
function downloadCsv(galleries: Gallery[]) {
  const header = ["병원명", "갤러리명", "유형", "사진 수", "공개 상태", "고객 연결", "촬영일", "등록일"];
  const rows = galleries.map((g) => [
    g.hospital_name, g.description || "", TYPE_LABEL[g.gallery_type || "retouched"] || g.gallery_type || "",
    String(g.items?.length ?? 0), g.publication ? "공개됨" : "미공개", g.client_id ? "연결됨" : "미연결",
    formatDate(g.shoot_date), formatDate(g.created_at),
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => toCsvCell(String(cell))).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `앨범갤러리_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PcrmGalleryTable() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [publishFilter, setPublishFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [formOpen, setFormOpen] = useState(false);
  const [editSource, setEditSource] = useState<GalleryEditSource | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/galleries", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setGalleries(d.galleries || []); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return galleries.filter((g) => {
      if (search) {
        const haystack = `${g.hospital_name} ${g.description || ""} ${g.contact_name || ""}`.toLowerCase();
        if (!haystack.includes(search.toLowerCase())) return false;
      }
      if (typeFilter && (g.gallery_type || "retouched") !== typeFilter) return false;
      if (publishFilter === "published" && !g.publication) return false;
      if (publishFilter === "unpublished" && g.publication) return false;
      if (linkFilter === "linked" && !g.client_id) return false;
      if (linkFilter === "unlinked" && g.client_id) return false;
      return true;
    });
  }, [galleries, search, typeFilter, publishFilter, linkFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resetFilters = () => { setSearch(""); setTypeFilter(""); setPublishFilter(""); setLinkFilter(""); setPage(1); };

  const openCreate = () => { setEditSource(null); setFormOpen(true); };
  const openEdit = (g: Gallery) => { setEditSource(g); setFormOpen(true); };
  const closeForm = () => setFormOpen(false);
  const onSaved = () => { setFormOpen(false); load(); };

  return (
    <div className="pcrm-dashboard">
      <div className="pcrm-dashboard-title">
        <div>
          <span>PCRM · PHOTOCLINIC CRM</span>
          <h1>앨범/갤러리 관리</h1>
          <small style={{ display: "block", marginTop: 4, fontSize: 11, fontWeight: 700, color: C.muted }}>
            고객에게 전달된 모든 앨범과 갤러리의 공개 상태를 확인하고 관리할 수 있습니다.
          </small>
        </div>
        <div className="pcrm-dashboard-actions">
          <button type="button" onClick={openCreate}><Plus size={16} /> 갤러리 생성</button>
        </div>
      </div>

      <section className="pcrm-filter-bar" style={cardStyle} aria-label="갤러리 검색·필터">
        <div className="pcrm-filter-field">
          <span>고객명</span>
          <label className="pcrm-filter-search">
            <Images size={15} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="고객명, 갤러리명으로 검색하세요." />
          </label>
        </div>
        <div className="pcrm-filter-field">
          <span>유형</span>
          <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">전체</option>
            <option value="retouched">보정본</option>
            <option value="original">원본</option>
          </select>
        </div>
        <div className="pcrm-filter-field">
          <span>공개 상태</span>
          <select value={publishFilter} onChange={(e) => { setPublishFilter(e.target.value); setPage(1); }}>
            <option value="">전체</option>
            <option value="published">공개됨</option>
            <option value="unpublished">미공개</option>
          </select>
        </div>
        <div className="pcrm-filter-field">
          <span>고객 연결</span>
          <select value={linkFilter} onChange={(e) => { setLinkFilter(e.target.value); setPage(1); }}>
            <option value="">전체</option>
            <option value="linked">연결됨</option>
            <option value="unlinked">미연결</option>
          </select>
        </div>
        <button type="button" className="pcrm-filter-reset" onClick={resetFilters}>필터 초기화</button>
      </section>

      <section className="pcrm-project-panel" style={cardStyle}>
        <header>
          <div><h2>갤러리 목록</h2><span>병원명을 클릭하면 NAS 갤러리가 새 창에서 열립니다.</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <b>전체 {filtered.length.toLocaleString()}건</b>
            <button type="button" className="pcrm-inline-action" onClick={() => downloadCsv(filtered)}><Download size={13} /> CSV 다운로드</button>
          </div>
        </header>
        <div className="pcrm-project-table pcrm-gallery-table">
          <div className="pcrm-project-row pcrm-project-row--head">
            <span>갤러리</span>
            <span>고객명</span>
            <span>유형</span>
            <span>사진 수</span>
            <span>공개 상태</span>
            <span>고객 연결</span>
            <span>촬영일</span>
            <span />
          </div>
          {loading ? (
            <p className="pcrm-empty-copy">불러오는 중...</p>
          ) : paged.length === 0 ? (
            <p className="pcrm-empty-copy">조건에 맞는 갤러리가 없습니다.</p>
          ) : paged.map((g) => (
            <div key={g.id} className="pcrm-project-row" role="button" tabIndex={0}
              onClick={() => window.open(g.nas_link, "_blank", "noopener,noreferrer")}
              onKeyDown={(e) => { if (e.key === "Enter") window.open(g.nas_link, "_blank", "noopener,noreferrer"); }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {g.items?.[0]?.thumbnail_url ? (
                  <img src={g.items[0].thumbnail_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 8, background: "rgba(21,88,85,.08)", flexShrink: 0 }}><Images size={15} color="#155855" /></span>
                )}
                <span>{g.description || `${g.hospital_name} 갤러리`}<small>{g.contact_name || "담당자 미지정"}</small></span>
              </span>
              <span>{g.hospital_name}</span>
              <span><i data-state="empty">{TYPE_LABEL[g.gallery_type || "retouched"] || g.gallery_type}</i></span>
              <span>{g.items?.length ?? 0}장</span>
              <span><i data-state={g.publication ? "done" : "empty"}>{g.publication ? "공개됨" : "미공개"}</i></span>
              <span><i data-state={g.client_id ? "done" : "empty"}>{g.client_id ? "연결됨" : "미연결"}</i></span>
              <span>{formatDate(g.shoot_date)}</span>
              <span className="pcrm-row-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="pcrm-row-menu__trigger" aria-label="수정" onClick={() => openEdit(g)}><Pencil size={15} /></button>
                <a href={g.nas_link} target="_blank" rel="noreferrer" className="pcrm-row-menu__trigger" aria-label="열기" onClick={(e) => e.stopPropagation()}><ExternalLink size={15} /></a>
              </span>
            </div>
          ))}
        </div>
        <footer className="pcrm-pagination">
          <div className="pcrm-pagination__size"><span>전체 {filtered.length}건</span></div>
          <div className="pcrm-pagination__nav">
            <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>이전</button>
            <span>{currentPage} / {totalPages}</span>
            <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>다음</button>
          </div>
        </footer>
      </section>

      <GalleryFormModal open={formOpen} editSource={editSource} onClose={closeForm} onSaved={onSaved} />
    </div>
  );
}
