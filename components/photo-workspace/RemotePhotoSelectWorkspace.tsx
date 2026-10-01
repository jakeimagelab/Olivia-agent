"use client";

import { Check, FileSearch, FolderOpen, Images, RotateCcw, Send } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { normalizeSelectionReportFileNames } from "@/lib/photo-operations/selectionReportFileNames";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { useBackgroundJobsStore } from "@/lib/store/useBackgroundJobsStore";
import { usePhotoStudioExecution } from "./PhotoStudioExecutionContext";
import styles from "./RemotePhotoSelectWorkspace.module.css";

type LocalJpg = {
  id: string;
  name: string;
  group: string;
  file: File;
};

type SelectionReportImage = {
  id: string;
  name: string;
  file: File;
};

type RemoteRawMatchJob = {
  id: string;
  action: "PHOTO_RAW_MATCH";
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  progress?: { current?: number; total?: number; message?: string } | null;
  result?: Record<string, unknown> | null;
  message?: string | null;
  error?: string | null;
};

const JPG_PATTERN = /\.(jpe?g)$/i;
const REPORT_IMAGE_PATTERN = /\.(jpe?g|png|webp)$/i;
const POLL_INTERVAL_MS = 3_000;
const MAX_REPORT_IMAGES = 4;

function fileNameKey(name: string): string {
  return name.normalize("NFC").toLocaleLowerCase("en-US");
}

function groupName(file: File): string {
  const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
  const segments = relativePath.split("/").filter(Boolean);
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "선택한 JPG";
}

function parseJob(value: unknown): RemoteRawMatchJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RAW 매칭 작업 상태를 읽지 못했습니다.");
  const job = value as Record<string, unknown>;
  const status = typeof job.status === "string" ? job.status.toUpperCase() : "";
  if (typeof job.id !== "string" || !["QUEUED", "RUNNING", "COMPLETED", "FAILED"].includes(status)) {
    throw new Error("RAW 매칭 작업 상태를 읽지 못했습니다.");
  }
  return {
    id: job.id,
    action: "PHOTO_RAW_MATCH",
    status: status as RemoteRawMatchJob["status"],
    progress: job.progress && typeof job.progress === "object" && !Array.isArray(job.progress)
      ? job.progress as RemoteRawMatchJob["progress"]
      : null,
    result: job.result && typeof job.result === "object" && !Array.isArray(job.result)
      ? job.result as Record<string, unknown>
      : null,
    message: typeof job.message === "string" ? job.message : null,
    error: typeof job.error === "string" ? job.error : null,
  };
}

const RemoteJpgThumbnail = memo(function RemoteJpgThumbnail({ photo, selected, ocrSelected, onToggle }: {
  photo: LocalJpg;
  selected: boolean;
  ocrSelected: boolean;
  onToggle: (id: string) => void;
}) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.file);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);

  return (
    <button
      type="button"
      className={`${styles.photoCard} ${selected ? styles.photoCardSelected : ""}`}
      onClick={() => onToggle(photo.id)}
      aria-pressed={selected}
      title={photo.name}
    >
      {/* 로컬 Blob URL은 Next Image 최적화 서버로 보내지 않는다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {source ? <img src={source} alt={photo.name} loading="lazy" decoding="async" /> : null}
      {selected ? <span className={styles.check}><Check size={12} strokeWidth={3} aria-hidden="true" /></span> : null}
      {ocrSelected ? <span className={styles.ocrBadge}>OCR</span> : null}
      <span className={styles.photoName}>{photo.name}</span>
    </button>
  );
});

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function reportImageDataUrl(file: File): Promise<string> {
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name} 이미지를 읽지 못했습니다.`));
      element.src = source;
    });
    const maxEdge = 2_048;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지 분석용 캔버스를 만들지 못했습니다.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(source);
  }
}

export default function RemotePhotoSelectWorkspace() {
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<LocalJpg[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reportImages, setReportImages] = useState<SelectionReportImage[]>([]);
  const [ocrFileNames, setOcrFileNames] = useState<string[]>([]);
  const [ocrSelectedNames, setOcrSelectedNames] = useState<Set<string>>(() => new Set());
  const [ocrAnalyzing, setOcrAnalyzing] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [remoteSelection, setRemoteSelection] = useState<RemoteNasSelection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState<RemoteRawMatchJob | null>(null);
  const { workerPresence } = usePhotoStudioExecution();

  useEffect(() => {
    directoryInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const groups = useMemo(() => {
    const grouped = new Map<string, LocalJpg[]>();
    for (const photo of photos) grouped.set(photo.group, [...(grouped.get(photo.group) ?? []), photo]);
    return [...grouped.entries()];
  }, [photos]);

  const selectedFileNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const photo of photos) {
      if (!selectedIds.has(photo.id)) continue;
      const key = fileNameKey(photo.name);
      if (!names.has(key)) names.set(key, photo.name);
    }
    for (const name of ocrFileNames) {
      const key = fileNameKey(name);
      if (!ocrSelectedNames.has(key) || names.has(key)) continue;
      names.set(key, name);
    }
    return [...names.values()];
  }, [ocrFileNames, ocrSelectedNames, photos, selectedIds]);

  const ocrMatchedPhotoIds = useMemo(() => {
    const matched = new Set<string>();
    for (const photo of photos) {
      if (ocrSelectedNames.has(fileNameKey(photo.name))) matched.add(photo.id);
    }
    return matched;
  }, [ocrSelectedNames, photos]);

  const effectiveSelectedIds = useMemo(() => new Set([...selectedIds, ...ocrMatchedPhotoIds]), [ocrMatchedPhotoIds, selectedIds]);

  const ocrUnmatchedNames = useMemo(() => {
    const localNames = new Set(photos.map((photo) => fileNameKey(photo.name)));
    return ocrFileNames.filter((name) => !localNames.has(fileNameKey(name)) && ocrSelectedNames.has(fileNameKey(name)));
  }, [ocrFileNames, ocrSelectedNames, photos]);

  const loadFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((file) => JPG_PATTERN.test(file.name))
      .map((file, index): LocalJpg => {
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        return { id: `${relativePath}\u0000${file.size}\u0000${file.lastModified}\u0000${index}`, name: file.name, group: groupName(file), file };
      });
    setPhotos(next);
    setSelectedIds(new Set());
    setExpandedGroups(new Set(next.length ? [next[0].group] : []));
    setJob(null);
    setRestartRequired(false);
    setError(next.length ? "" : "선택한 항목에서 JPG/JPEG 파일을 찾지 못했습니다.");
    setNotice(next.length ? `JPG ${next.length.toLocaleString("ko-KR")}장을 불러왔습니다.` : "");
  }, []);

  const loadReportImages = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const next = Array.from(fileList)
      .filter((file) => REPORT_IMAGE_PATTERN.test(file.name))
      .slice(0, MAX_REPORT_IMAGES)
      .map((file, index): SelectionReportImage => ({ id: `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${index}`, name: file.name, file }));
    setReportImages(next);
    setOcrFileNames([]);
    setOcrSelectedNames(new Set());
    setOcrError(next.length ? "" : "PNG, JPG 또는 WebP 셀렉 리포트 이미지를 선택해주세요.");
    if (next.length) setNotice(`셀렉 리포트 이미지 ${next.length}장을 준비했습니다. 이미지 속 파일명 분석을 실행하세요.`);
    if (reportInputRef.current) reportInputRef.current.value = "";
  }, []);

  const resetSelection = useCallback(() => {
    setPhotos([]);
    setSelectedIds(new Set());
    setReportImages([]);
    setOcrFileNames([]);
    setOcrSelectedNames(new Set());
    setOcrError("");
    setExpandedGroups(new Set());
    setRemoteSelection(null);
    setJob(null);
    setRestartRequired(false);
    setNotice("");
    setError("");
    if (directoryInputRef.current) directoryInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (reportInputRef.current) reportInputRef.current.value = "";
  }, []);

  const togglePhoto = useCallback((id: string) => {
    const photo = photos.find((item) => item.id === id);
    if (photo && ocrSelectedNames.has(fileNameKey(photo.name)) && !selectedIds.has(id)) {
      setOcrSelectedNames((current) => {
        const next = new Set(current);
        next.delete(fileNameKey(photo.name));
        return next;
      });
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [ocrSelectedNames, photos, selectedIds]);

  const toggleOcrName = useCallback((name: string) => {
    const key = fileNameKey(name);
    setOcrSelectedNames((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const analyzeReportImages = useCallback(async () => {
    if (!reportImages.length || ocrAnalyzing) return;
    setOcrAnalyzing(true);
    setOcrError("");
    setNotice("이미지 안의 JPG 파일명을 읽고 있습니다.");
    try {
      const images = await Promise.all(reportImages.map(async (report) => ({
        name: report.name,
        imageDataUrl: await reportImageDataUrl(report.file),
      })));
      const response = await fetch("/api/photo-operations/extract-selection-file-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
      if (!response.ok || record.ok !== true) throw new Error(typeof record.error === "string" ? record.error : "이미지 속 파일명을 분석하지 못했습니다.");
      const names = normalizeSelectionReportFileNames(record.fileNames);
      setOcrFileNames(names);
      setOcrSelectedNames(new Set(names.map(fileNameKey)));
      setNotice(names.length
        ? `이미지에서 JPG 파일명 ${names.length}개를 찾았습니다. RAW 대상에 포함할 이름을 확인하세요.`
        : "이미지에서 완전한 JPG/JPEG 파일명을 찾지 못했습니다. 직접 셀렉은 그대로 유지됩니다.");
    } catch (cause) {
      setOcrError(cause instanceof Error ? cause.message : "이미지 속 파일명을 분석하지 못했습니다.");
      setNotice("");
    } finally {
      setOcrAnalyzing(false);
    }
  }, [ocrAnalyzing, reportImages]);

  const mirrorJob = useCallback((nextJob: RemoteRawMatchJob) => {
    setJob(nextJob);
    const current = numeric(nextJob.progress?.current);
    const total = numeric(nextJob.progress?.total);
    const message = nextJob.status === "FAILED"
      ? nextJob.error || nextJob.message || "RAW 매칭 작업을 확인해주세요."
      : nextJob.progress?.message || nextJob.message || (nextJob.status === "QUEUED" ? "Mac Studio 작업 대기 중" : "RAW 매칭 진행 중");
    const store = useBackgroundJobsStore.getState();
    const existing = store.jobs[nextJob.id];
    if (!existing) {
      store.startJob({
        id: nextJob.id,
        label: "Mac Studio RAW 매칭",
        cur: current,
        total,
        msg: message,
        status: nextJob.status === "COMPLETED" ? "done" : nextJob.status === "FAILED" ? "error" : "running",
        returnPath: `/photo-sorting?mode=select&selectMode=manual&remoteJobId=${encodeURIComponent(nextJob.id)}`,
        cancelRef: { current: false },
        cancelable: false,
      });
    } else {
      store.updateJob(nextJob.id, { cur: current, total, msg: message });
      if (nextJob.status === "COMPLETED" || nextJob.status === "FAILED") {
        store.finishJob(nextJob.id, nextJob.status === "COMPLETED" ? "done" : "error");
      }
    }
  }, []);

  const pollingJobId = job?.id;
  const pollingJobStatus = job?.status;

  useEffect(() => {
    if (!pollingJobId || (pollingJobStatus !== "QUEUED" && pollingJobStatus !== "RUNNING")) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    const poll = async () => {
      request = new AbortController();
      try {
        const response = await fetch(`/api/remote-jobs?id=${encodeURIComponent(pollingJobId)}`, { cache: "no-store", signal: request.signal });
        const body: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("RAW 매칭 작업 상태를 확인하지 못했습니다.");
        }
        const nextJob = parseJob((body as Record<string, unknown>).job);
        if (disposed) return;
        mirrorJob(nextJob);
        if (nextJob.status === "QUEUED" || nextJob.status === "RUNNING") timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (cause) {
        if (!disposed && !request.signal.aborted) {
          setNotice(cause instanceof Error ? `${cause.message} 작업은 서버에서 계속됩니다.` : "작업 상태 연결을 다시 확인하고 있습니다.");
          timer = setTimeout(() => void poll(), 10_000);
        }
      } finally {
        request = null;
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      request?.abort();
    };
  }, [mirrorJob, pollingJobId, pollingJobStatus]);

  const submit = useCallback(async (confirmRestart = false) => {
    if (!remoteSelection || !selectedFileNames.length || submitting) return;
    setSubmitting(true);
    setError("");
    setNotice("선택 파일명으로 Mac Studio RAW 매칭 작업을 주문하고 있습니다.");
    try {
      const response = await fetch("/api/photo-operations/raw-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectRelativePath: remoteSelection.path,
          selectedFileNames,
          confirmRestart,
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
      if (!response.ok) {
        if (response.status === 409 && record.code === "PHOTO_OPERATION_RESTART_CONFIRMATION_REQUIRED") {
          setRestartRequired(true);
          setNotice(typeof record.error === "string" ? record.error : "이 프로젝트의 RAW 매칭을 다시 실행할까요?");
          return;
        }
        throw new Error(typeof record.error === "string" ? record.error : "RAW 매칭 작업을 주문하지 못했습니다.");
      }
      const nextJob = parseJob(record.job);
      setRestartRequired(false);
      setNotice(nextJob.status === "RUNNING" ? "RAW 매칭이 이미 진행 중입니다." : "RAW 매칭 작업을 시작했습니다.");
      mirrorJob(nextJob);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "RAW 매칭 작업을 주문하지 못했습니다.");
      setNotice("");
    } finally {
      setSubmitting(false);
    }
  }, [mirrorJob, remoteSelection, selectedFileNames, submitting]);

  const active = job?.status === "QUEUED" || job?.status === "RUNNING";
  const result = job?.result ?? null;
  const workerOffline = workerPresence.online === false;

  return (
    <div className={styles.workspace}>
      <section className={styles.intro}>
        <div className={styles.introText}>
          <p className={styles.eyebrow}>REMOTE JPG SELECT</p>
          <h3>외부에서 JPG를 고르고 RAW는 Mac Studio가 복사합니다</h3>
          <p>사진 파일은 업로드하지 않습니다. 선택된 파일명만 안전하게 전달합니다.</p>
        </div>
        <span className={`${styles.workerState} ${workerOffline ? styles.workerOffline : ""}`}>
          <i /> {workerOffline ? "Mac Studio 오프라인" : workerPresence.online === true ? "Mac Studio 온라인" : "Mac Studio 확인 중"}
        </span>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><h3><span className={styles.step}>1</span>셀렉할 JPG 불러오기</h3><p>폴더 전체 또는 필요한 JPG 파일들을 선택하세요.</p></div>
        </div>
        <input ref={directoryInputRef} type="file" accept=".jpg,.jpeg,image/jpeg" multiple hidden onChange={(event) => loadFiles(event.target.files)} />
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,image/jpeg" multiple hidden onChange={(event) => loadFiles(event.target.files)} />
        <div className={styles.inputActions}>
          <button type="button" className={styles.primaryButton} onClick={() => directoryInputRef.current?.click()}><FolderOpen size={16} /> JPG 폴더 선택</button>
          <button type="button" className={styles.secondaryButton} onClick={() => fileInputRef.current?.click()}><Images size={16} /> JPG 파일 선택</button>
          {photos.length ? <button type="button" className={styles.secondaryButton} onClick={resetSelection}><RotateCcw size={15} /> 초기화</button> : null}
        </div>
        {photos.length ? <div className={styles.fileSummary}><strong>{photos.length.toLocaleString("ko-KR")}장</strong> 불러옴 · <strong>{selectedFileNames.length.toLocaleString("ko-KR")}장</strong> RAW 대상</div> : null}

        {photos.length ? (
          <>
            <div className={styles.selectionActions} style={{ marginTop: 12 }}>
              <button type="button" className={styles.secondaryButton} onClick={() => setSelectedIds(new Set(photos.map((photo) => photo.id)))}>전체 선택</button>
              <button type="button" className={styles.secondaryButton} onClick={() => { setSelectedIds(new Set()); setOcrSelectedNames(new Set()); }}>전체 해제</button>
            </div>
            {groups.map(([group, groupPhotos]) => {
              const expanded = expandedGroups.has(group);
              const selectedCount = groupPhotos.filter((photo) => effectiveSelectedIds.has(photo.id)).length;
              return (
                <div key={group} className={styles.group}>
                  <button type="button" className={styles.groupHeader} onClick={() => setExpandedGroups((current) => {
                    const next = new Set(current);
                    if (next.has(group)) next.delete(group); else next.add(group);
                    return next;
                  })}>
                    <strong>{group}</strong><span>{selectedCount ? `${selectedCount}장 선택 · ` : ""}{groupPhotos.length}장 {expanded ? "▲" : "▼"}</span>
                  </button>
                  {expanded ? <div className={styles.photoGrid}>{groupPhotos.map((photo) => <RemoteJpgThumbnail key={photo.id} photo={photo} selected={effectiveSelectedIds.has(photo.id)} ocrSelected={ocrMatchedPhotoIds.has(photo.id)} onToggle={togglePhoto} />)}</div> : null}
                </div>
              );
            })}
          </>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><h3><span className={styles.step}>1+</span>셀렉 리포트 이미지 분석 <em>선택</em></h3><p>카카오·갤러리 스크린샷 안에 적힌 JPG 파일명을 읽어 RAW 대상으로 가져옵니다.</p></div>
        </div>
        <input ref={reportInputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden onChange={(event) => loadReportImages(event.target.files)} />
        <div className={styles.inputActions}>
          <button type="button" className={styles.secondaryButton} onClick={() => reportInputRef.current?.click()}><Images size={16} /> 셀렉 리포트 이미지 선택</button>
          <button type="button" className={styles.primaryButton} disabled={!reportImages.length || ocrAnalyzing} onClick={() => void analyzeReportImages()}><FileSearch size={16} /> {ocrAnalyzing ? "파일명 읽는 중..." : "이미지 속 파일명 분석"}</button>
        </div>
        {reportImages.length ? <div className={styles.reportFiles}>{reportImages.map((report) => <span key={report.id}>{report.name}</span>)}</div> : null}
        {ocrFileNames.length ? (
          <div className={styles.ocrResults}>
            <div className={styles.ocrHeading}><strong>인식한 JPG 파일명 {ocrFileNames.length}개</strong><span>현재 JPG 목록 자동 선택 {ocrMatchedPhotoIds.size}개 · 목록에 없는 이름 {ocrUnmatchedNames.length}개</span></div>
            <div className={styles.ocrNameList}>
              {ocrFileNames.map((name) => {
                const key = fileNameKey(name);
                const matched = photos.some((photo) => fileNameKey(photo.name) === key);
                return <label key={key} className={styles.ocrName}><input type="checkbox" checked={ocrSelectedNames.has(key)} onChange={() => toggleOcrName(name)} /><span>{name}</span><small>{matched ? "현재 JPG와 일치" : "NAS RAW에서 확인"}</small></label>;
              })}
            </div>
          </div>
        ) : null}
        {ocrError ? <div className={styles.error} role="alert">{ocrError}</div> : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHeading}>
          <div><h3><span className={styles.step}>2</span>Workstation 촬영 폴더</h3><p>선택한 JPG와 같은 이름의 RAW가 있는 프로젝트를 지정하세요.</p></div>
        </div>
        <div className={styles.targetRow}>
          <div className={styles.targetInfo}><small>RAW 원본 프로젝트</small><strong>{remoteSelection?.displayPath || "촬영 폴더를 선택하지 않았습니다."}</strong></div>
          <button type="button" className={styles.secondaryButton} onClick={() => setSourcePickerOpen(true)}><FolderOpen size={16} /> {remoteSelection ? "변경" : "NAS 폴더 선택"}</button>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.submitRow}>
          <div className={styles.safetyNote}>
            Workstation RAW 원본은 그대로 유지됩니다.<br />복사본: Agentstation/{remoteSelection?.displayPath || "촬영 폴더"}/Selected_RAW
          </div>
          <button type="button" className={restartRequired ? styles.dangerButton : styles.primaryButton} disabled={!selectedFileNames.length || !remoteSelection || submitting || active || workerOffline} onClick={() => void submit(restartRequired)}>
            <Send size={16} /> {submitting ? "주문 중..." : restartRequired ? "다시 실행" : active ? "진행 중" : `RAW 복사 시작 (${selectedFileNames.length.toLocaleString("ko-KR")}장)`}
          </button>
        </div>
      </section>

      {notice ? <div className={styles.notice} role="status">{notice}</div> : null}
      {error ? <div className={styles.error} role="alert">{error}</div> : null}

      {job ? (
        <section className={styles.result}>
          <h3>{job.status === "COMPLETED" ? "RAW 복사가 완료되었습니다" : job.status === "FAILED" ? "RAW 복사를 확인해주세요" : "RAW 복사가 진행 중입니다"}</h3>
          <div className={styles.safetyNote}>{job.progress?.message || job.error || job.message || "Mac Studio 작업 상태를 확인하고 있습니다."}</div>
          {job.status === "COMPLETED" && result ? (
            <div className={styles.resultGrid}>
              <div><strong>{numeric(result.selectedCount)}</strong><span>선택 JPG</span></div>
              <div><strong>{numeric(result.matchedCount)}</strong><span>RAW 복사</span></div>
              <div><strong>{Array.isArray(result.missingNames) ? result.missingNames.length : 0}</strong><span>RAW 누락</span></div>
            </div>
          ) : null}
        </section>
      ) : null}

      {sourcePickerOpen ? <PhotoSourcePicker onCancel={() => setSourcePickerOpen(false)} onSelectRemote={(selection) => { setRemoteSelection(selection); setSourcePickerOpen(false); setRestartRequired(false); }} /> : null}
    </div>
  );
}
