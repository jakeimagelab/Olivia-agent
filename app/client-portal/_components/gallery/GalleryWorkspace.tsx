"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCircle2,
  Download,
  Expand,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Send,
  X,
} from "lucide-react";

type SelectionImage = {
  id: string;
  original_file_name: string;
  image_url: string;
  thumbnail_url?: string;
  preview_url?: string;
};

type PhotoItem = {
  id: string;
  title?: string;
  thumbnail_url?: string;
  nas_file_url?: string;
};

type Annotation = {
  id: string;
  image_id: string;
  marker_number: number;
  x_ratio: number;
  y_ratio: number;
  content: string;
  status: string;
  admin_reply?: string;
};

type Workspace = {
  selection: {
    publication: any;
    gallery: any;
    images: SelectionImage[];
    draft: any;
    submissions: any[];
  };
  retouched: {
    publication: any;
    gallery: { id: string; nas_link?: string; items?: PhotoItem[] } | null;
    annotations: Annotation[];
  };
  finalDelivery: {
    publication: any;
    gallery: { id: string; nas_link?: string; items?: PhotoItem[] } | null;
    confirmation: any;
  };
};

const STEPS = [
  { key: "selection", label: "사진 셀렉" },
  { key: "retouched", label: "보정본 확인" },
  { key: "revision", label: "수정 요청" },
  { key: "final", label: "최종 납품" },
] as const;

export function GalleryWorkspace({
  workspace,
  token,
  onRefresh,
}: {
  workspace: Workspace;
  token: string;
  onRefresh: () => Promise<void>;
}) {
  const firstAvailable = workspace.selection.gallery
    ? "selection"
    : workspace.retouched.gallery
      ? "retouched"
      : workspace.finalDelivery.gallery
        ? "final"
        : "selection";
  const [active, setActive] = useState<(typeof STEPS)[number]["key"]>(firstAvailable);

  return (
    <main className="pcrm-gallery-workspace">
      <div className="pcrm-portal-subpage-title pcrm-gallery-heading">
        <div>
          <span>PCRM · GALLERY</span>
          <h1>촬영 결과물</h1>
          <p>사진 선택부터 보정 확인, 수정 위치 표시와 최종 승인까지 한곳에서 진행합니다.</p>
        </div>
        <div className="pcrm-gallery-summary">
          <strong>{workspace.selection.gallery?.selected_count ?? 0}</strong>
          <span>현재 선택</span>
        </div>
      </div>

      <nav className="pcrm-gallery-steps" aria-label="갤러리 작업 단계">
        {STEPS.map((step, index) => {
          const available = step.key === "selection"
            ? Boolean(workspace.selection.gallery)
            : step.key === "final"
              ? Boolean(workspace.finalDelivery.gallery)
              : Boolean(workspace.retouched.gallery);
          return (
            <button
              key={step.key}
              type="button"
              className={active === step.key ? "is-active" : ""}
              disabled={!available}
              onClick={() => setActive(step.key)}
            >
              <i>{index + 1}</i>
              <span>{step.label}</span>
            </button>
          );
        })}
      </nav>

      {!workspace.selection.gallery && !workspace.retouched.gallery && !workspace.finalDelivery.gallery ? (
        <EmptyGallery />
      ) : active === "selection" ? (
        <SelectionPanel key={`${workspace.selection.gallery?.id}:${workspace.selection.submissions?.length ?? 0}`} selection={workspace.selection} token={token} onRefresh={onRefresh} />
      ) : active === "retouched" ? (
        <RetouchedPanel gallery={workspace.retouched.gallery} />
      ) : active === "revision" ? (
        <RevisionPanel data={workspace.retouched} token={token} onRefresh={onRefresh} />
      ) : (
        <FinalPanel data={workspace.finalDelivery} token={token} onRefresh={onRefresh} />
      )}
    </main>
  );
}

function SelectionPanel({ selection, token, onRefresh }: { selection: Workspace["selection"]; token: string; onRefresh: () => Promise<void> }) {
  const initialIds = selection.draft?.selected_image_ids
    ?? filenamesToIds(selection.images, selection.submissions?.[0]?.selected_files ?? []);
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [favorites, setFavorites] = useState<string[]>(selection.draft?.favorite_image_ids ?? []);
  const [memo, setMemo] = useState(selection.draft?.customer_memo ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<SelectionImage | null>(null);
  const initialRender = useRef(true);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const galleryId = selection.gallery?.id;
  const expired = galleryId && new Date(selection.gallery.file_expires_at).getTime() <= Date.now();

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      setSaving(true);
      const result = await portalRequest("/api/client-portal/gallery-workspace", token, "PUT", {
        galleryId,
        selectedImageIds: selected,
        favoriteImageIds: favorites,
        customerMemo: memo,
      });
      setSaving(false);
      setStatus(result.ok ? "선택 내용이 자동 저장되었습니다." : result.error);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [favorites, galleryId, memo, selected, token]);

  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const submit = async () => {
    setSubmitting(true);
    setStatus("");
    const result = await portalRequest("/api/client-portal/gallery-workspace/submit", token, "POST", {
      galleryId,
      selectedImageIds: selected,
      customerMemo: memo,
      requestKey: crypto.randomUUID(),
    });
    setSubmitting(false);
    setStatus(result.ok ? `사진 ${selected.length}장을 제출했습니다. 다시 제출하면 최신 선택으로 반영됩니다.` : result.error);
    if (result.ok) await onRefresh();
  };

  return (
    <section className="pcrm-gallery-panel">
      <header className="pcrm-gallery-panel-header">
        <div><strong>{selection.gallery.title || "셀렉 갤러리"}</strong><span>원하는 사진을 선택한 뒤 제출해주세요. 제출 후에도 변경할 수 있습니다.</span></div>
        <div><b>{selected.length}</b><span>장 선택</span></div>
      </header>
      {expired ? <div className="pcrm-gallery-notice is-error">사진 보관 기간이 만료되었습니다. 담당자에게 기간 연장을 요청해주세요.</div> : null}
      <div className="pcrm-photo-grid">
        {selection.images.map((image, index) => (
          <article key={image.id} className={selectedSet.has(image.id) ? "is-selected" : ""}>
            <button type="button" className="pcrm-photo-preview" onClick={() => setPreview(image)}>
              <img src={image.thumbnail_url || image.preview_url || image.image_url} alt={image.original_file_name} loading="lazy" />
              <Expand size={15} />
            </button>
            <button type="button" className="pcrm-photo-check" aria-label={`${image.original_file_name} 선택`} onClick={() => toggle(image.id)}>
              {selectedSet.has(image.id) ? <Check size={15} /> : <span>{index + 1}</span>}
            </button>
            <button type="button" className={`pcrm-photo-favorite ${favoriteSet.has(image.id) ? "is-active" : ""}`} aria-label="즐겨찾기" onClick={() => toggleFavorite(image.id)}>
              <Heart size={15} fill={favoriteSet.has(image.id) ? "currentColor" : "none"} />
            </button>
            <footer title={image.original_file_name}>{image.original_file_name}</footer>
          </article>
        ))}
      </div>
      <div className="pcrm-gallery-submitbar">
        <label><span>촬영팀에 전할 메모</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={5000} placeholder="셀렉 기준이나 참고할 내용을 남겨주세요." /></label>
        <div>
          <small>{saving ? "자동 저장 중…" : status}</small>
          <button type="button" disabled={expired || selected.length === 0 || submitting} onClick={submit}>
            {submitting ? <LoaderCircle size={15} className="is-spinning" /> : <Send size={15} />}
            {selection.submissions?.length ? "변경 선택 제출" : "선택 제출"}
          </button>
        </div>
      </div>
      {preview ? <ImageDialog image={preview.thumbnail_url || preview.preview_url || preview.image_url} title={preview.original_file_name} onClose={() => setPreview(null)} /> : null}
    </section>
  );
}

function RetouchedPanel({ gallery }: { gallery: Workspace["retouched"]["gallery"] }) {
  if (!gallery) return <EmptyGallery title="보정본이 아직 공개되지 않았습니다." />;
  return (
    <section className="pcrm-gallery-panel">
      <header className="pcrm-gallery-panel-header">
        <div><strong>최신 보정본</strong><span>고객에게 공개된 최신 버전만 표시됩니다.</span></div>
        {gallery.nas_link ? <a href={gallery.nas_link} target="_blank" rel="noreferrer"><ImageIcon size={15} /> 전체 갤러리 열기</a> : null}
      </header>
      <PhotoItemGrid items={gallery.items ?? []} />
    </section>
  );
}

function RevisionPanel({ data, token, onRefresh }: { data: Workspace["retouched"]; token: string; onRefresh: () => Promise<void> }) {
  const items = data.gallery?.items ?? [];
  const [selectedImage, setSelectedImage] = useState<PhotoItem | null>(items[0] ?? null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [content, setContent] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!data.gallery) return <EmptyGallery title="수정할 보정본이 아직 공개되지 않았습니다." />;
  const imageAnnotations = data.annotations.filter((item) => item.image_id === selectedImage?.id);

  const createAnnotation = async () => {
    if (!selectedImage || !point || !content.trim()) return;
    setBusy(true);
    const result = await portalRequest("/api/client-portal/gallery-workspace/annotations", token, "POST", {
      galleryId: data.gallery!.id,
      imageId: selectedImage.id,
      xRatio: point.x,
      yRatio: point.y,
      content,
    });
    setBusy(false);
    setMessage(result.ok ? "수정 위치를 저장했습니다." : result.error);
    if (result.ok) {
      setPoint(null);
      setContent("");
      await onRefresh();
    }
  };
  const submit = async () => {
    setBusy(true);
    const result = await portalRequest("/api/client-portal/gallery-workspace/revisions/submit", token, "POST", {
      galleryId: data.gallery!.id,
      memo,
    });
    setBusy(false);
    setMessage(result.ok ? "수정 요청을 담당자에게 전달했습니다." : result.error);
    if (result.ok) await onRefresh();
  };

  return (
    <section className="pcrm-gallery-panel pcrm-revision-layout">
      <div className="pcrm-revision-stage">
        <header><strong>사진에서 수정할 위치를 눌러주세요</strong><span>표시 위치와 설명이 함께 전달됩니다.</span></header>
        {selectedImage ? (
          <div
            className="pcrm-annotation-canvas"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setPoint({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
            }}
          >
            <img src={selectedImage.thumbnail_url || selectedImage.nas_file_url} alt={selectedImage.title || "보정 사진"} />
            {imageAnnotations.map((annotation) => <i key={annotation.id} style={{ left: `${Number(annotation.x_ratio) * 100}%`, top: `${Number(annotation.y_ratio) * 100}%` }}>{annotation.marker_number}</i>)}
            {point ? <i className="is-new" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}>+</i> : null}
          </div>
        ) : <div className="pcrm-client-empty">수정할 사진을 선택해주세요.</div>}
        <div className="pcrm-annotation-editor">
          <MapPin size={16} />
          <input value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} placeholder={point ? "이 위치에서 수정할 내용을 입력하세요." : "먼저 사진에서 위치를 눌러주세요."} />
          <button type="button" disabled={!point || !content.trim() || busy} onClick={createAnnotation}>표시 추가</button>
        </div>
      </div>
      <aside>
        <div className="pcrm-revision-thumbs">
          {items.map((item) => (
            <button key={item.id} type="button" className={selectedImage?.id === item.id ? "is-active" : ""} onClick={() => { setSelectedImage(item); setPoint(null); }}>
              <img src={item.thumbnail_url || item.nas_file_url} alt="" />
              <span>{data.annotations.filter((annotation) => annotation.image_id === item.id).length}</span>
            </button>
          ))}
        </div>
        <div className="pcrm-annotation-list">
          {data.annotations.length ? data.annotations.map((annotation) => (
            <article key={annotation.id}>
              <b>{annotation.marker_number}</b>
              <div><strong>{annotation.content}</strong><span>{annotation.status === "draft" ? "제출 전" : "담당자에게 전달됨"}</span>{annotation.admin_reply ? <p>{annotation.admin_reply}</p> : null}</div>
            </article>
          )) : <div className="pcrm-client-empty">등록된 수정 표시가 없습니다.</div>}
        </div>
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="전체 수정 요청에 관한 메모" />
        <button type="button" className="pcrm-primary-action" disabled={!data.annotations.some((item) => item.status === "draft") || busy} onClick={submit}>
          <Send size={15} /> 수정 요청 제출
        </button>
        {message ? <small className="pcrm-form-message">{message}</small> : null}
      </aside>
    </section>
  );
}

function FinalPanel({ data, token, onRefresh }: { data: Workspace["finalDelivery"]; token: string; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const viewed = useRef(false);
  useEffect(() => {
    if (!data.gallery || viewed.current) return;
    viewed.current = true;
    void portalRequest("/api/client-portal/gallery-workspace/final", token, "POST", {
      galleryId: data.gallery.id,
      action: "view",
    });
  }, [data.gallery, token]);
  if (!data.gallery) return <EmptyGallery title="최종 납품 자료가 아직 공개되지 않았습니다." />;
  const approved = Boolean(data.confirmation?.approved_at);
  const perform = async (action: "download" | "approve") => {
    setBusy(true);
    const result = await portalRequest("/api/client-portal/gallery-workspace/final", token, "POST", {
      galleryId: data.gallery!.id,
      action,
      statement: "최종 납품 자료를 확인하고 승인합니다.",
    });
    setBusy(false);
    setMessage(result.ok ? action === "approve" ? "최종 납품 승인이 완료되었습니다." : "다운로드 이력을 기록했습니다." : result.error);
    if (result.ok) {
      if (action === "download" && data.gallery?.nas_link) window.open(data.gallery.nas_link, "_blank", "noopener,noreferrer");
      await onRefresh();
    }
  };
  return (
    <section className="pcrm-gallery-panel">
      <header className="pcrm-gallery-panel-header">
        <div><strong>최종 납품</strong><span>파일을 확인한 뒤 최종 승인해주세요.</span></div>
        {approved ? <b className="pcrm-approved-badge"><CheckCircle2 size={14} /> 승인 완료</b> : null}
      </header>
      <PhotoItemGrid items={data.gallery.items ?? []} />
      <div className="pcrm-final-actions">
        <button type="button" disabled={busy || !data.gallery.nas_link} onClick={() => perform("download")}><Download size={16} /> 최종 파일 열기</button>
        <button type="button" className="is-primary" disabled={busy || approved} onClick={() => perform("approve")}><CheckCircle2 size={16} /> {approved ? "최종 승인 완료" : "최종 납품 승인"}</button>
      </div>
      {message ? <div className="pcrm-gallery-notice">{message}</div> : null}
    </section>
  );
}

function PhotoItemGrid({ items }: { items: PhotoItem[] }) {
  if (!items.length) return <div className="pcrm-client-empty">등록된 미리보기 이미지가 없습니다. 전체 갤러리 링크를 이용해주세요.</div>;
  return <div className="pcrm-photo-grid">{items.map((item) => <article key={item.id}><a className="pcrm-photo-preview" href={item.nas_file_url || item.thumbnail_url} target="_blank" rel="noreferrer"><img src={item.thumbnail_url || item.nas_file_url} alt={item.title || "갤러리 사진"} loading="lazy" /><Expand size={15} /></a><footer>{item.title || "촬영 사진"}</footer></article>)}</div>;
}

function ImageDialog({ image, title, onClose }: { image: string; title: string; onClose: () => void }) {
  return <div className="pcrm-image-dialog" role="dialog" aria-modal="true" onClick={onClose}><button type="button" aria-label="닫기"><X /></button><figure onClick={(event) => event.stopPropagation()}><img src={image} alt={title} /><figcaption>{title}</figcaption></figure></div>;
}

function EmptyGallery({ title = "아직 공개된 촬영 결과물이 없습니다." }: { title?: string }) {
  return <section className="pcrm-portal-card pcrm-gallery-empty"><ImageIcon size={30} /><strong>{title}</strong><span>담당 매니저가 자료를 공개하면 이 화면에서 바로 확인할 수 있습니다.</span></section>;
}

function filenamesToIds(images: SelectionImage[], filenames: string[]) {
  const names = new Set(filenames);
  return images.filter((image) => names.has(image.original_file_name)).map((image) => image.id);
}

async function portalRequest(url: string, token: string, method: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method,
      headers: { "content-type": "application/json", "x-portal-token": token },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    return response.ok && payload.ok ? payload : { ok: false, error: payload.error || "요청을 처리하지 못했습니다." };
  } catch {
    return { ok: false, error: "서버 연결을 확인해주세요." };
  }
}
