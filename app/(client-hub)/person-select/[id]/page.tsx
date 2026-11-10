"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Clipboard, Download, Folder, FolderOpen, Info, Link2, Monitor, Plus, RefreshCw, Server, SlidersHorizontal, Trash2, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { formatSeoulDeadline, formatSeoulDateTimeInput } from "@/lib/person-select/date";
import { DEFAULT_PERSON_SELECT_EXTRA_MAX, DEFAULT_PERSON_SELECT_EXTRA_PRICE, DEFAULT_PERSON_SELECT_NOTICE, DEFAULT_PERSON_SELECT_OFFERS, type PersonSelectAccessMode, type PersonSelectCustomerViewMode, type PersonSelectOffer, type PersonSelectProjectType } from "@/lib/person-select/types";
import { collectLocalPersonSelectFileList, collectLocalPersonSelectFolder, type LocalPersonSelectScan } from "@/lib/person-select/localImport";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import { usePersonSelectUploadManager } from "@/components/person-select/upload/PersonSelectUploadManager";
import { PERSON_SELECT_ACCESS_MODE_LABELS, PERSON_SELECT_CUSTOMER_VIEW_LABELS, PERSON_SELECT_PROJECT_TYPE_LABELS } from "@/lib/person-select/projectSettings";
import CustomerBridgeSelect, { type CustomerBridgeDraft, type CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type Choice = { id: string; category_key: string; retouch_keys: string[]; memo: string; updated_at: string; person_select_images: { original_file_name: string; source_rel_path: string; thumb_url: string } | null };
type RepresentativeImage = { category_key: string; original_file_name: string; source_rel_path: string; thumb_url: string };
type Person = { id: string; display_name: string; group_label: string | null; first_seen_at: string | null; submitted_at: string | null; status_label: string; latest_activity_at: string | null; image_counts: Record<string, number>; need_counts: Record<string, number>; choices: Choice[]; representative_image?: RepresentativeImage | null; representative_images?: Record<string, RepresentativeImage>; order?: { lines: OrderLine[]; total: number } };
type Category = { key: string; label: string; pick: number };
type OrderLine = { label: string; detail: string; unitPrice: number; qty: number; amount: number };
type EventData = { id: string; title: string; slug: string; deadline_at: string; status: string; categories: Category[]; retouch_options: { key: string; label: string }[]; source_layout?: "school" | "person-folders" | "project"; source_relative_path?: string | null; raw_match_result?: Record<string, unknown> | null; raw_matched_at?: string | null ; offer_notice?: string; extra_price?: number; extra_max?: number; offers?: PersonSelectOffer[]; project_type?: PersonSelectProjectType; access_mode?: PersonSelectAccessMode; customer_view_mode?: PersonSelectCustomerViewMode; shared_token?: string | null; shared_link_active?: boolean; shared_token_expires_at?: string | null; nas_download_url?: string | null; customer_ai_results_visible?: boolean };
type SharedSelectionItem = { image_id: string; customer_rating: number | null; customer_color_label?: number | null; memo: string; image: { original_file_name: string; source_rel_path: string; thumb_url: string } | null };
type SharedSelection = { id: string; submitted_at: string; customer_memo: string; items: SharedSelectionItem[] };
type SharedReviewer = { id: string; display_name: string; role_label: string | null; active: boolean; is_legacy: boolean; last_seen_at: string | null; can_view_ai_results?: boolean; can_download_jpg?: boolean; can_download_raw?: boolean; can_finalize?: boolean; draft: (CustomerBridgeDraft & { selected_count: number; updated_at: string }) | null; selection: SharedSelection | null };
type SharedAdminData = { image_count: number; images: CustomerBridgeImage[]; selection: SharedSelection | null; reviewers: SharedReviewer[] };
type Layout = "school" | "person-folders" | "project";
type SourceMode = "local" | "remote";
type Group = { label: string; image_count: number };
type Filter = "all" | "done" | "saving" | "unseen";
type PinListPerson = { id: string; displayName: string; loginName: string; suggestedLoginName: string; canAutoNormalize: boolean; groupLabel: string; pin: string };

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function relativeTime(value: string | null) {
  if (!value) return "—";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}시간 전`;
  return new Intl.RelativeTimeFormat("ko", { numeric: "auto" }).format(-Math.round(minutes / 1440), "day");
}

function folderName(value: string | null | undefined) {
  if (!value) return "";
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function matchingFolderName(value: string | null | undefined) {
  if (!value) return "폴더 확인 필요";
  return value.split("/").filter(Boolean)[0] ?? "폴더 확인 필요";
}

function personPhotoCount(person: Person) {
  return Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((sum, [, count]) => sum + count, 0);
}

export default function PersonSelectDetailPage() {
  const params = useParams<{ id: string }>(); const router = useRouter(); const windowRoute = useDesktopWindowRoute();
  const routePath = windowRoute.routeHref ? new URL(windowRoute.routeHref, "https://olivia.local").pathname : ""; const routeId = routePath.match(/^\/person-select\/([^/]+)\/?$/)?.[1]; const id = routeId || params.id;
  const [data, setData] = useState<{ event: EventData; people: Person[]; groups: Group[]; shared?: SharedAdminData | null } | null>(null);
  const [tab, setTab] = useState<"matching" | "progress" | "upload" | "settings">("matching");
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState(false);
  const [path, setPath] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("local");
  const [localFolderName, setLocalFolderName] = useState("");
  const [localScan, setLocalScan] = useState<LocalPersonSelectScan | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const handledUploadJobRef = useRef<string | null>(null);
  const uploadManager = usePersonSelectUploadManager();
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Person | null>(null);
  const [pinListOpen, setPinListOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout | null>(null);
  const [rawJobId, setRawJobId] = useState("");
  const [rawResult, setRawResult] = useState<Record<string, unknown> | null>(null);
  const [selectedReviewerId, setSelectedReviewerId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerRole, setReviewerRole] = useState("");
  const [issuedReviewerTokens, setIssuedReviewerTokens] = useState<Record<string, string>>({});
  const navigate = (href: string) => windowRoute.navigate ? windowRoute.navigate(href, "개인별 사진 셀렉") : router.push(href);
  const load = useCallback(() => fetch(`/api/person-select/${id}`).then((r) => r.json()).then((body) => { if (!body.ok) throw new Error(body.error); setData(body); setAssignments(Object.fromEntries((body.groups as Group[]).map((group) => [group.label, (body.people as Person[]).find((person) => person.group_label === group.label)?.id ?? ""]))); }), [id]);
  useEffect(() => { void load().catch((cause) => setError(cause.message)); fetch("/api/remote-workers/status").then((r) => r.json()).then((body) => setWorkerOnline(body.worker?.online ?? false)); }, [load]);
  useEffect(() => {
    const reviewers = data?.shared?.reviewers ?? [];
    if (!reviewers.length) { setSelectedReviewerId(null); return; }
    if (selectedReviewerId && reviewers.some((reviewer) => reviewer.id === selectedReviewerId)) return;
    setSelectedReviewerId((reviewers.find((reviewer) => !reviewer.is_legacy) ?? reviewers[0]).id);
  }, [data?.shared?.reviewers, selectedReviewerId]);
  useEffect(() => { if (!jobId) return; const timer = window.setInterval(async () => { const body = await (await fetch(`/api/remote-jobs?id=${jobId}`)).json(); if (["COMPLETED", "FAILED", "CANCELED"].includes(body.job?.status)) { window.clearInterval(timer); setResult(body.job.result || { error: body.job.error || body.job.message }); setJobId(""); await load(); if (body.job?.status === "COMPLETED") setTab("matching"); } }, 1500); return () => window.clearInterval(timer); }, [jobId, load]);
  useEffect(() => { if (!rawJobId) return; const timer = window.setInterval(async () => { const body = await (await fetch(`/api/remote-jobs?id=${rawJobId}`)).json(); if (["COMPLETED", "FAILED", "CANCELED"].includes(body.job?.status)) { window.clearInterval(timer); setRawJobId(""); setRawResult(body.job.result || { error: body.job.error || body.job.message }); await load(); } }, 1500); return () => window.clearInterval(timer); }, [rawJobId, load]);
  useEffect(() => {
    if (!deleteOpen || deleting) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDeleteOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);
  const eventUploadJob = uploadManager.jobs.find((job) => job.event_id === id) ?? null;
  const localBusy = Boolean(eventUploadJob && (eventUploadJob.status === "queued" || eventUploadJob.status === "uploading"));
  const localProgress = eventUploadJob ? { current: eventUploadJob.success_count, total: eventUploadJob.total_count, fileName: "" } : { current: 0, total: 0, fileName: "" };
  useEffect(() => {
    if (!eventUploadJob || handledUploadJobRef.current === eventUploadJob.id || !["completed", "partial_failed", "failed"].includes(eventUploadJob.status)) return;
    handledUploadJobRef.current = eventUploadJob.id;
    setResult({
      photoCount: eventUploadJob.total_count,
      importedCount: eventUploadJob.success_count,
      failedCount: eventUploadJob.failed_count,
      message: eventUploadJob.status === "completed" ? "사진 업로드가 완료됐어요." : eventUploadJob.status === "partial_failed" ? "일부 사진을 올리지 못했어요." : "사진 업로드에 실패했어요.",
    });
    void load();
    if (eventUploadJob.status === "completed") setTab("matching");
  }, [eventUploadJob, load]);
  const filtered = useMemo(() => (data?.people ?? []).filter((person) => {
    if (filter === "done") return person.status_label.includes("제출");
    if (filter === "saving") return person.status_label === "저장 중";
    if (filter === "unseen") return person.status_label === "미접속";
    return true;
  }), [data, filter]);
  const selectedPerson = data?.people.find((person) => person.id === selectedId) ?? null;
  // Olivia OS에는 이전 고객이 아니라 이 창이 실제로 연 행사만 전달한다.
  useEffect(() => {
    if (!data) return;
    const need = selectedPerson ? Object.values(selectedPerson.need_counts ?? {}).reduce((sum, value) => sum + value, 0) : 0;
    const retouch = selectedPerson?.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0) ?? 0;
    const memos = selectedPerson?.choices.filter((choice) => choice.memo).map((choice) => `${choice.person_select_images?.original_file_name ?? ""}: ${choice.memo}`) ?? [];
    emitShellSelection({
      sourceAppId: "person-select",
      sourceWindowId: "person-select",
      itemId: selectedPerson?.id ?? data.event.id,
      title: data.event.title,
      subtitle: selectedPerson
        ? `${selectedPerson.display_name} · ${selectedPerson.status_label} · 고른 사진 ${selectedPerson.choices.length} / ${need}장 · 보정 요청 ${retouch}개${selectedPerson.order?.total ? ` · 추가 주문 ${won(selectedPerson.order.total)}` : ""}`
        : `마감 ${formatSeoulDeadline(data.event.deadline_at)} · ${data.people.length}명`,
      next: memos.length ? memos.join(" / ") : "행사 진행 현황과 고객 선택을 확인합니다.",
      context: { contextScope: "none", routeHref: `/person-select/${data.event.id}`, resourceId: data.event.id, resourceType: "person-select-event", documentTitle: data.event.title, featureItemId: selectedPerson?.id ?? data.event.id },
      featureItemId: selectedPerson?.id ?? data.event.id,
    });
  }, [selectedPerson, data]);
  if (!data) return <main className={styles.shell}><div className={styles.loading}>{error || "행사를 불러오는 중이에요"}</div></main>;
  const currentData = data;
  // 가져오기 방식: 이미 가져온 행사는 그때 방식, 처음이면 이름 폴더 방식
  const isShared = data.event.access_mode === "project_shared";
  const sharedReviewers = data.shared?.reviewers ?? [];
  const selectedReviewer = sharedReviewers.find((reviewer) => reviewer.id === selectedReviewerId) ?? sharedReviewers[0] ?? null;
  const selectedSharedSelection = selectedReviewer?.selection ?? null;
  const currentLayout: Layout = layout ?? (isShared ? "project" : data.people.length && data.event.source_layout === "school" ? "school" : "person-folders");
  const isSchool = currentLayout === "school";
  const personWord = isSchool ? "선생님" : "이름";
  const categories = data.event.categories ?? [];
  const categoryLabels = new Map(categories.map((item) => [item.key, item.label]));
  const counts = { done: data.people.filter((person) => person.status_label.includes("제출")).length, saving: data.people.filter((person) => person.status_label === "저장 중").length, unseen: data.people.filter((person) => person.status_label === "미접속").length };
  const totalPhotos = isShared ? Number(data.shared?.image_count ?? 0) : data.people.reduce((sum, person) => sum + Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((acc, [, value]) => acc + value, 0), 0);
  const pickText = isShared ? `프로젝트 공용 셀렉 · 검토자 ${sharedReviewers.filter((reviewer) => !reviewer.is_legacy).length}명` : categories.length === 1 ? `한 사람당 ${categories[0].pick}장` : categories.map((item) => `${item.label} ${item.pick}장`).join(" · ");
  const sourceFolder = folderName(data.event.source_relative_path);
  async function selectLocalFolder() {
    const showDirectoryPicker = (window as Window & { showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    if (!showDirectoryPicker) { localInputRef.current?.click(); return; }
    try {
      // 폴더 선택기는 사용자 클릭의 첫 await에서 바로 열어야 브라우저가 차단하지 않는다.
      const directory = await showDirectoryPicker({ mode: "read" });
      setError("");
      const selected = await collectLocalPersonSelectFolder(directory, currentLayout);
      setLocalFolderName(selected.folderName);
      setLocalScan(selected.scan);
      setResult(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "로컬 폴더를 읽지 못했습니다.");
    }
  }
  function selectLocalFileList(files: FileList | null) {
    if (!files?.length) return;
    try {
      const selected = collectLocalPersonSelectFileList(files, currentLayout);
      setError("");
      setLocalFolderName(selected.folderName);
      setLocalScan(selected.scan);
      setResult(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로컬 폴더를 읽지 못했습니다.");
    } finally {
      if (localInputRef.current) localInputRef.current.value = "";
    }
  }
  async function startRemoteImport() {
    if (!path) return setError(isSchool ? "학교전달 폴더를 선택해 주세요." : "촬영 폴더를 선택해 주세요."); setError(""); setResult(null);
    const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_IMPORT", payload: isSchool ? { event_id: id, source_relative_path: path, mappings: [{ folder: "선생님프로필", category: "profile", owner: "person" }, { folder: "담임선생님", category: "homeroom", owner: "group" }] } : { event_id: id, source_relative_path: path, layout: currentLayout } }) }); const body = await response.json(); if (!response.ok) return setError(body.error); setJobId(body.job?.id || body.id); setResult({ message: "사진 가져오기를 시작했어요." });
  }
  async function startLocalImport() {
    if (!localScan?.files.length) return setError("JPG가 들어 있는 로컬 폴더를 선택해 주세요.");
    setError(""); setResult(null);
    try {
      if (eventUploadJob && !["completed", "canceled"].includes(eventUploadJob.status) && (eventUploadJob.needs_file_reselection || eventUploadJob.failed_count > 0)) {
        await uploadManager.reattachLocalFiles(eventUploadJob.id, localScan);
        setResult({ message: "완료된 사진은 건너뛰고 남은 사진을 이어서 올립니다." });
      } else {
        await uploadManager.startLocalUpload({ eventId: id, projectTitle: currentData.event.title, layout: currentLayout, sourceName: localFolderName || "로컬 폴더", scan: localScan });
        setResult({ message: "업로드를 시작했어요. 다른 OS 앱으로 이동해도 이 탭이 열려 있는 동안 계속됩니다." });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로컬 사진 가져오기에 실패했습니다.");
    }
  }
  function startImport() { return sourceMode === "local" ? startLocalImport() : startRemoteImport(); }
  async function startRawMatch() {
    setError(""); setRawResult(null);
    const notSubmitted = currentData.people.filter((person) => !person.submitted_at).length;
    if (notSubmitted && !window.confirm(`아직 제출하지 않은 사람이 ${notSubmitted}명 있습니다. 제출한 사람의 사진만 RAW 매칭할까요?`)) return;
    const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_RAW_MATCH", payload: { event_id: id } }) }); const body = await response.json();
    if (!response.ok) return setError(body.error); setRawJobId(body.job?.id || body.id); setRawResult({ message: "RAW 매칭을 시작했어요." });
  }
  async function saveGroups() { const response = await fetch(`/api/person-select/${id}/groups`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: currentData.groups.map((group) => ({ group: group.label, person_id: assignments[group.label] || null })) }) }); const body = await response.json(); if (!response.ok) return setError(body.error); await load(); }
  async function saveSettings(patch: Record<string, unknown>) {
    if (patch.status === "open") {
      const unassigned = currentData.groups.filter((group) => !assignments[group.label]);
      if (unassigned.length && !window.confirm(`담임 선생님이 연결되지 않은 반이 ${unassigned.length}개 있습니다. 그래도 행사를 열까요?`)) return;
    }
    setError("");
    const requestSave = async (confirmed = false): Promise<void> => {
      const payload = confirmed ? { ...patch, confirm_access_mode_impact: true } : patch;
      const response = await fetch(`/api/person-select/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { await load(); return; }
      if (body.code === "ACCESS_MODE_CONFIRMATION_REQUIRED") {
        if (window.confirm(body.warning || body.error || "공용 링크 전환의 영향을 확인하고 계속할까요?")) await requestSave(true);
        return;
      }
      setError(body.error || "설정을 저장하지 못했습니다.");
    };
    await requestSave();
  }
  async function deleteProject() {
    if (deleteConfirmTitle.trim() !== currentData.event.title) return;
    setDeleting(true); setError("");
    try {
      const response = await fetch(`/api/person-select/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmTitle: deleteConfirmTitle.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "프로젝트를 삭제하지 못했습니다.");
      setDeleteOpen(false);
      navigate("/person-select");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로젝트를 삭제하지 못했습니다.");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  }
  async function regenerateSharedLink() {
    if (!isShared || !window.confirm("기존 공용 링크는 즉시 사용할 수 없게 됩니다. 새 링크를 만들까요?")) return;
    setError("");
    const response = await fetch(`/api/person-select/${id}/regenerate-shared-token`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setError(body.error || "공용 링크를 다시 만들지 못했습니다.");
    await load();
  }
  async function createReviewer() {
    if (!reviewerName.trim()) return setError("검토자 이름을 입력해 주세요.");
    setError("");
    const response = await fetch(`/api/person-select/${id}/reviewers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: reviewerName, roleLabel: reviewerRole }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setError(body.error || "검토자를 추가하지 못했습니다.");
    setIssuedReviewerTokens((current) => ({ ...current, [body.reviewer.id]: body.token }));
    setSelectedReviewerId(body.reviewer.id);
    setReviewerName("");
    setReviewerRole("");
    await load();
  }
  async function regenerateReviewerLink(reviewer: SharedReviewer) {
    if (!window.confirm(`${reviewer.display_name}의 기존 링크는 즉시 사용할 수 없게 됩니다. 새 링크를 만들까요?`)) return;
    setError("");
    const response = await fetch(`/api/person-select/${id}/reviewers/${reviewer.id}/regenerate-token`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setError(body.error || "검토자 링크를 다시 만들지 못했습니다.");
    setIssuedReviewerTokens((current) => ({ ...current, [reviewer.id]: body.token }));
    await load();
  }
  async function setReviewerActive(reviewer: SharedReviewer, active: boolean) {
    setError("");
    const response = await fetch(`/api/person-select/${id}/reviewers/${reviewer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setError(body.error || "검토자 상태를 바꾸지 못했습니다.");
    await load();
  }
  async function setReviewerPermission(reviewer: SharedReviewer, key: "canViewAiResults" | "canDownloadJpg" | "canDownloadRaw" | "canFinalize", value: boolean) {
    setError("");
    const response = await fetch(`/api/person-select/${id}/reviewers/${reviewer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: value }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) return setError(body.error || "검토자 권한을 바꾸지 못했습니다.");
    await load();
  }
  async function copyReviewerLink(reviewerId: string) {
    const token = issuedReviewerTokens[reviewerId];
    if (!token) return setError("보안상 링크는 발급 직후에만 확인됩니다. 링크 재발급 후 복사해 주세요.");
    await navigator.clipboard.writeText(`${location.origin}/pick/shared/${token}`);
    setError("검토자 링크를 복사했습니다.");
  }
  const labels = new Map(data.event.retouch_options.map((item) => [item.key, item.label]));
  const loginGuide = isShared ? "공용 링크에서 프로젝트 사진을 함께 선택해 주세요" : isSchool ? "이름과 학교에서 받은 비밀번호 4자리로 들어오세요" : "이름과 포토클리닉에서 받은 비밀번호 4자리로 들어오세요";
  const publicPath = isShared && data.event.shared_token ? `/pick/shared/${data.event.shared_token}` : `/pick/${data.event.slug}`;
  const notice = `주소: ${typeof location !== "undefined" ? location.origin : ""}${publicPath} / ${loginGuide} / 마감: ${formatSeoulDeadline(data.event.deadline_at)}`;
  const tabs = isShared
    ? [["matching", "사진 확인", UsersRound], ["progress", "고객 셀렉", Activity], ["upload", "사진 올리기", Upload], ["settings", "프로젝트 설정", SlidersHorizontal]] as const
    : [["matching", "인원 매칭", UsersRound], ["progress", "진행 현황", Activity], ["upload", "사진 올리기", Upload], ["settings", "프로젝트 설정", SlidersHorizontal]] as const;
  const filters: [Filter, string, number][] = [["all", "전체", data.people.length], ["done", "제출 완료", counts.done], ["saving", "저장 중", counts.saving], ["unseen", "미접속", counts.unseen]];
  const groupFolders = Array.isArray(result?.groupFolders) ? (result.groupFolders as unknown[]).map(String) : [];
  const unnamedFolders = Array.isArray(result?.unnamedFolders) ? (result.unnamedFolders as unknown[]).map(String) : [];
  const rawBusy = Boolean(rawJobId);
  const submittedCount = isShared ? sharedReviewers.filter((reviewer) => Boolean(reviewer.selection)).length : counts.done;
  const rawDisabledReason = submittedCount === 0 ? "최종 제출된 고객 셀렉이 없어요." : !data.event.source_relative_path ? "Mac Studio에서 같은 원본 폴더를 연결해 주세요." : workerOnline === false ? "Mac Studio가 꺼져 있어요." : isShared ? "고객이 고른 사진의 RAW를 기존 승인 흐름으로 매칭합니다." : "제출한 사람이 고른 사진의 RAW를 Selected_RAW/이름 폴더로 복사합니다.";
  return <main className={styles.shell}>
    <section className={styles.body}>
      <div className={styles.crumb}><button className={styles.crumbBack} onClick={() => navigate("/person-select")}><ArrowLeft size={14} />사진선택</button>{sourceFolder ? <><span aria-hidden="true">›</span><span>{sourceFolder}</span></> : null}</div>
      <div className={styles.titleRow}>
        <div><h1 className={styles.title}>{data.event.title}</h1><p className={styles.subtitle}>마감 {formatSeoulDeadline(data.event.deadline_at)} · {isShared ? PERSON_SELECT_ACCESS_MODE_LABELS.project_shared : `${data.people.length}명`} · {pickText}{totalPhotos ? ` · 사진 ${totalPhotos.toLocaleString()}장` : ""}</p></div>
        <div className={styles.actions}>
          <button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>
          {!isShared ? <><button type="button" className={styles.secondary} onClick={() => setPinListOpen(true)}><UserRound size={15} />비밀번호 목록</button><a className={styles.secondary} href={`/api/person-select/${id}/exports/retouch`}><Download size={15} />보정 목록 CSV</a><a className={styles.secondary} href={`/api/person-select/${id}/exports/orders`}><Download size={15} />주문 CSV</a></> : null}
          <button className={styles.primary} disabled={workerOnline === false || rawBusy || submittedCount === 0 || !data.event.source_relative_path} title={rawDisabledReason} onClick={startRawMatch}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button>
        </div>
      </div>
      <div className={styles.segment} role="tablist">{tabs.map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.segmentActive : ""} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}</div>
      {error ? <div className={styles.warning}>{error}</div> : null}
      <RawMatchResult result={rawResult ?? data.event.raw_match_result ?? null} at={rawResult ? null : data.event.raw_matched_at ?? null} />
      {tab === "matching" && isShared ? <section className={styles.matchingPanel}>
        <div className={styles.matchingHeader}><div><h2>프로젝트 사진 확인</h2><p>검토자별 셀렉은 서로 독립적으로 보존되며 오른쪽 대화 탭은 모든 참여자가 함께 사용합니다.</p></div><div className={styles.actions}>{sharedReviewers.length ? <select className={styles.select} aria-label="확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => setSelectedReviewerId(event.target.value)}>{sharedReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""}</option>)}</select> : null}<button className={styles.primary} onClick={() => setTab(totalPhotos ? "progress" : "upload")}>{totalPhotos ? "고객 셀렉 보기" : "사진 올리기"}</button></div></div>
        {data.shared?.images?.length ? <CustomerBridgeSelect
          key={`${selectedReviewer?.id ?? "project"}:${selectedReviewer?.draft?.revision ?? 0}:${selectedSharedSelection?.id ?? "draft"}`}
          shareToken=""
          apiBase={`/api/person-select/${id}`}
          storageScope={`person-select-admin:${id}:${selectedReviewer?.id ?? "project"}`}
          gallery={{ id, title: data.event.title, total_jpg_count: data.shared.images.length, allow_resubmit: false }}
          images={data.shared.images}
          initialDraft={selectedReviewer?.draft ?? null}
          initialSelection={selectedSharedSelection}
          reviewer={selectedReviewer}
          messagesEnabled
          qualityApi={`/api/person-select/${id}/quality`}
          canManageQuality
          onSubmitted={() => undefined}
          readOnly
          embedded
        /> : <div className={styles.matchingEmpty}><Info size={28} /><strong>등록된 사진이 없어요.</strong><span>사진 올리기에서 프로젝트 폴더를 선택해 주세요.</span></div>}
      </section> : null}
      {tab === "matching" && !isShared ? <section className={styles.matchingPanel}>
        <div className={styles.matchingHeader}>
          <div><h2>인원 매칭 확인</h2><p>원본 폴더별 등록 인원과 사진 수를 확인하세요.</p></div>
          {data.people.length ? <button className={styles.primary} onClick={() => setTab("progress")}>확인하고 진행 현황 보기</button> : <button className={styles.primary} onClick={() => setTab("upload")}>사진 올리기</button>}
        </div>
        {data.people.length ? <div className={styles.matchingGrid}>{data.people.map((person) => {
          const representative = person.representative_image;
          const photoCount = personPhotoCount(person);
          return <article className={styles.matchingCard} key={person.id}>
            <div className={styles.matchingFolder} aria-hidden="true"><Folder size={56} strokeWidth={1.35} /></div>
            <div className={styles.matchingMeta}><div><strong>{person.display_name}</strong><span>{photoCount.toLocaleString()}장</span></div><p>원본 폴더 · {matchingFolderName(representative?.source_rel_path)}</p></div>
          </article>;
        })}</div> : <div className={styles.matchingEmpty}><UsersRound size={28} /><strong>매칭할 사람이 아직 없어요.</strong><span>사진을 올리면 폴더 이름으로 사람을 만들고 등록 수를 보여드려요.</span></div>}
      </section> : null}
      {tab === "progress" && isShared ? <section className={styles.matchingPanel}>
        <div className={styles.matchingHeader}><div><h2>검토자별 고객 셀렉</h2><p>{selectedSharedSelection ? `${selectedReviewer?.display_name ?? "검토자"}가 ${selectedSharedSelection.items.length.toLocaleString()}장을 최종 제출했습니다.` : "검토자를 선택해 자동 저장 수와 최종 제출 결과를 확인하세요."}</p></div><div className={styles.actions}>{sharedReviewers.length ? <select className={styles.select} aria-label="셀렉을 확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => setSelectedReviewerId(event.target.value)}>{sharedReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""} · {reviewer.selection ? `제출 ${reviewer.selection.items.length}장` : `저장 ${reviewer.draft?.selected_count ?? 0}장`}</option>)}</select> : null}{selectedSharedSelection ? <span className={styles.status}>제출 완료</span> : <span className={`${styles.status} ${styles.statusIdle}`}>미제출</span>}</div></div>
        {selectedSharedSelection?.customer_memo ? <div className={styles.notice}>전체 메모<br />{selectedSharedSelection.customer_memo}</div> : null}
        {selectedSharedSelection?.items.length ? <div className={styles.matchingGrid}>{selectedSharedSelection.items.map((item) => <article className={styles.matchingCard} key={item.image_id}>{item.image?.thumb_url ? <img className={styles.matchingPhoto} src={item.image.thumb_url} alt={item.image.original_file_name} loading="lazy" /> : <div className={styles.matchingPhotoEmpty}>사진 확인 필요</div>}<div className={styles.matchingMeta}><div><strong>{item.image?.original_file_name ?? item.image_id}</strong><span>{item.customer_rating ? `${item.customer_rating}점` : item.customer_color_label ? `${item.customer_color_label}번 컬러` : "선택"}</span></div><p>{item.image?.source_rel_path ?? "상대경로 없음"}</p>{item.memo ? <small>{item.memo}</small> : null}</div></article>)}</div> : <div className={styles.matchingEmpty}><Info size={28} /><strong>제출된 사진이 없어요.</strong><span>{selectedReviewer?.draft?.selected_count ? `${selectedReviewer.display_name}의 자동 저장 초안 ${selectedReviewer.draft.selected_count}장은 보존되어 있습니다.` : "공용 링크의 자동 저장 초안과 최종 제출은 구분됩니다."}</span></div>}
      </section> : null}
      {tab === "progress" && !isShared ? <>
        <div className={styles.underTabs}>{filters.map(([key, label, count]) => <button key={key} className={filter === key ? styles.underTabActive : ""} onClick={() => setFilter(key)}>{label}<small>{count}</small></button>)}</div>
        <section className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{personWord}</th>{data.groups.length ? <th>담임 반</th> : null}{categories.map((category) => <th key={category.key}>{categories.length === 1 ? "고른 사진" : category.label} ({category.pick}장)</th>)}<th>보정 요청</th><th>추가 주문</th><th>상태</th><th>최근 활동</th><th /></tr></thead>
          <tbody>{filtered.map((person) => {
            const requests = person.choices.reduce((sum, choice) => sum + choice.retouch_keys.length, 0);
            return <tr key={person.id} className={person.id === selectedId ? styles.rowSelected : ""} onClick={() => setSelectedId(person.id)}>
              <td><strong>{person.display_name}</strong></td>
              {data.groups.length ? <td>{person.group_label || "—"}</td> : null}
              {categories.map((category) => {
                const own = person.choices.filter((choice) => choice.category_key === category.key);
                const need = person.need_counts?.[category.key] ?? 0;
                const registered = person.representative_images?.[category.key];
                if (need === 0) return <td key={category.key} className={styles.muted}>해당 없음</td>;
                return <td key={category.key}><span className={styles.thumbs}>{Array.from({ length: Math.min(Math.max(need, own.length), 4) }, (_, index) => { const chosenThumb = own[index]?.person_select_images?.thumb_url; const registeredThumb = index === 0 && !chosenThumb ? registered?.thumb_url : ""; return chosenThumb ? <img key={index} className={styles.thumb} src={chosenThumb} alt="고른 사진" /> : registeredThumb ? <img key={index} className={`${styles.thumb} ${styles.thumbRegistered}`} src={registeredThumb} alt={`${person.display_name} 등록 확인 사진`} title={`${registered?.original_file_name} · 고객 선택 전 등록 확인 사진`} /> : <span key={index} className={styles.thumbEmpty} />; })}<span className={styles.thumbCount}>{own.length > need ? `${own.length}장 (기본 ${need} + 추가 ${own.length - need})` : `${own.length} / ${need}장`}</span></span></td>;
              })}
              <td className={styles.muted}>{requests ? `${requests}개${person.choices.some((choice) => choice.memo) ? " · 메모 있음" : ""}` : person.choices.length ? "기본 보정" : "—"}</td>
              <td className={person.order?.total ? styles.orderTotal : styles.muted} title={person.order?.lines.map((line) => `${line.label} ${line.detail} ×${line.qty}`).join("\n") ?? ""}>{person.order?.total ? won(person.order.total) : "—"}</td>
              <td><span className={`${styles.status} ${person.status_label === "미접속" ? styles.statusIdle : person.status_label === "저장 중" ? styles.statusPending : ""}`}>{person.status_label}</span></td>
              <td className={styles.muted} title={person.latest_activity_at ? new Date(person.latest_activity_at).toLocaleString("ko-KR") : ""}>{relativeTime(person.latest_activity_at)}</td>
              <td><button className={styles.detailButton} onClick={(event) => { event.stopPropagation(); setSelectedId(person.id); setDrawer(person); }}>보기</button></td>
            </tr>;
          })}</tbody>
        </table></div>{filtered.length === 0 ? <div className={styles.loading}>해당하는 사람이 없어요.</div> : null}</section>
        <div className={styles.infoChips}>
          {groupFolders.length ? <span className={styles.infoChip}><UsersRound size={13} />그룹 사진 <b>{groupFolders.join(" · ")}</b> 은 작가가 직접 고름</span> : null}
          {unnamedFolders.length ? <span className={styles.infoChip}><Info size={13} />이름 미변경 <b>{unnamedFolders.join(" · ")}</b> 건너뜀</span> : null}
          {!isSchool && sourceFolder ? <span className={styles.infoChip}><FolderOpen size={13} />RAW 저장 위치 <b>{sourceFolder}/Selected_RAW/이름</b></span> : null}
        </div>
        {data.groups.length ? <section className={styles.uploadCard} style={{ marginTop: 18 }}><h2>담임 반 연결</h2><p className={styles.summary}>반 사진을 담당 선생님에게 연결합니다.</p><div className={styles.groupRows}>{data.groups.map((group) => <div className={styles.groupRow} key={group.label}><strong>{group.label}</strong><select className={styles.select} value={assignments[group.label] || ""} onChange={(e) => setAssignments({ ...assignments, [group.label]: e.target.value })}><option value="">미연결</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span>{group.image_count}장</span></div>)}</div><div className={styles.formActions}><button className={styles.secondary} onClick={saveGroups}>담임 반 연결 저장</button></div></section> : null}
      </> : null}
      {tab === "upload" ? <div className={styles.uploadGrid}>
        <section className={styles.uploadCard}>
          <h2>폴더에서 사진 올리기</h2>
          <div className={styles.field}><label>사진이 있는 위치</label><div className={styles.segment} style={{ margin: "6px 0 12px" }}>{([["local", "이 기기", Monitor], ["remote", "Mac Studio", Server]] as const).map(([key, label, Icon]) => <button key={key} disabled={localBusy} className={sourceMode === key ? styles.segmentActive : ""} onClick={() => setSourceMode(key)}><Icon size={15} />{label}</button>)}</div></div>
          <div className={styles.segment} style={{ margin: "6px 0 12px" }}>{(isShared ? [["project", "프로젝트 전체 폴더", UsersRound]] as const : [["person-folders", "이름 폴더 (김춘자/JPG원본)", UserRound], ["school", "학교 (선생님프로필·담임선생님)", UsersRound]] as const).map(([key, label, Icon]) => <button key={key} disabled={localBusy} className={currentLayout === key ? styles.segmentActive : ""} onClick={() => { setLayout(key); setLocalFolderName(""); setLocalScan(null); }}><Icon size={15} />{label}</button>)}</div>
          <p className={styles.summary}>{sourceMode === "local" ? "지금 Olivia를 연 기기" : "Mac Studio"}에서 {isShared ? "프로젝트" : isSchool ? "학교전달" : "촬영"} 폴더를 골라 썸네일과 1600px 미리보기만 올립니다.</p>
          {sourceMode === "remote" && workerOnline === false ? <div className={styles.warning}>Mac Studio가 꺼져 있어요. 켜진 뒤 다시 시도해 주세요.</div> : null}
          <div className={styles.selectedPath}>{sourceMode === "local" ? localFolderName || "선택된 로컬 폴더가 없습니다." : path || "선택된 Mac Studio 폴더가 없습니다."}</div>
          <input ref={(input) => { localInputRef.current = input; input?.setAttribute("webkitdirectory", ""); input?.setAttribute("directory", ""); }} type="file" accept="image/jpeg,.jpg,.jpeg" multiple className={styles.hiddenInput} onChange={(event) => selectLocalFileList(event.currentTarget.files)} />
          <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} disabled={sourceMode === "remote" ? workerOnline === false : localBusy} onClick={() => sourceMode === "local" ? void selectLocalFolder() : setPicker(true)}><FolderOpen size={15} />{eventUploadJob?.needs_file_reselection ? "같은 폴더 다시 선택" : "폴더 선택"}</button><button className={styles.primary} disabled={sourceMode === "local" ? localBusy || !localScan?.files.length : workerOnline === false || !path || Boolean(jobId && !result?.error && !result?.photoCount)} onClick={() => void startImport()}><Upload size={15} />{localBusy ? "업로드 진행 중" : eventUploadJob?.needs_file_reselection ? "남은 사진 이어서 올리기" : "사진 올리기"}</button></div>
          {sourceMode === "local" && localScan ? <p className={styles.summary}>올릴 JPG {localScan.files.length.toLocaleString()}장{localScan.groupFolders.length ? ` · 그룹 폴더 ${localScan.groupFolders.length}개 제외` : ""}{localScan.unnamedFolders.length ? ` · 이름 미변경 ${localScan.unnamedFolders.length}개 제외` : ""}</p> : null}
          {sourceMode === "local" && localBusy ? <div className={styles.result}>로컬 사진 {localProgress.current.toLocaleString()} / {localProgress.total.toLocaleString()}장 처리 중{localProgress.fileName ? ` · ${localProgress.fileName}` : ""}</div> : null}
          {sourceMode === "local" && eventUploadJob?.status === "paused" ? <div className={styles.warning}>업로드가 일시정지됐어요. <button className={styles.secondary} onClick={() => void uploadManager.resume(eventUploadJob.id).catch((cause) => setError(cause.message))}>계속</button></div> : null}
          {sourceMode === "local" && eventUploadJob?.needs_file_reselection && !localScan?.files.length ? <div className={styles.warning}>새로고침 뒤에는 브라우저가 로컬 파일 권한을 잃습니다. 같은 원본 폴더를 다시 선택하면 이미 성공한 사진은 건너뛰고 이어서 올립니다.</div> : null}
          {sourceMode === "local" && !localScan?.files.length ? <p className={styles.disabledReason}>사진을 올리려면 이 기기의 {isSchool ? "학교전달" : "촬영"} 폴더를 먼저 선택하세요.</p> : null}
          {sourceMode === "remote" && !path && workerOnline !== false ? <p className={styles.disabledReason}>사진을 올리려면 Mac Studio의 {isSchool ? "학교전달" : "촬영"} 폴더를 먼저 선택하세요.</p> : null}
          {sourceMode === "remote" ? <div className={styles.field} style={{ marginTop: 20 }}><label>경로 직접 입력</label><input className={styles.input} value={path} onChange={(e) => setPath(e.target.value)} placeholder={isSchool ? "/Users/jakemacstudio/UGnasync/.../학교전달" : "/Volumes/Agentstation(M.2SSD)/.../1031_촬영폴더"} /><small className={styles.summary}>Mac Studio의 폴더 경로를 그대로 붙여넣어도 돼요.</small></div> : null}
          {sourceMode === "local" && !data.event.source_relative_path ? <p className={styles.summary}>RAW 매칭은 같은 원본 폴더를 Mac Studio 위치에서 다시 선택해 사진 올리기를 실행하면 연결됩니다. 이미 올라온 사진은 건너뜁니다.</p> : null}
          {result ? <div className={styles.result}>{result.photoCount !== undefined ? <><div>{`사진 ${Number(result.photoCount).toLocaleString()}장 · 저장 완료 ${Number(result.importedCount ?? eventUploadJob?.success_count ?? 0).toLocaleString()}장 · 실패 ${Number(result.failedCount ?? 0).toLocaleString()}장`}</div>{result.message ? <div>{String(result.message)}</div> : null}{Array.isArray(result.skippedFolders) && result.skippedFolders.length ? <div className={styles.skippedFolders}>건너뛴 폴더: {result.skippedFolders.map(String).join(" / ")}</div> : null}{unnamedFolders.length ? <div className={styles.warning}>이름을 아직 안 바꾼 폴더라 올리지 않았어요: {unnamedFolders.join(" / ")}</div> : null}{groupFolders.length ? <div className={styles.skippedFolders}>그룹 사진은 고객에게 올리지 않았어요: {groupFolders.join(" / ")}</div> : null}</> : String(result.message || result.error || "처리 중이에요.")}</div> : null}
        </section>
        <aside className={styles.uploadCard}><h2>가져오는 항목</h2>{isShared ? <><div className={styles.notice}>선택한 프로젝트 폴더의 JPG를 하위 폴더까지 가져옵니다.<br />사람 계정이나 개인별 PIN은 만들지 않습니다.</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 상대경로를 보존한 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : isSchool ? <><div className={styles.notice}>선생님프로필 → 사람 이름으로 연결<br />담임선생님 → 반 단위로 등록 후 아래에서 연결</div><p className={styles.summary}>학생사진 폴더는 건너뛰고 가져오지 않습니다.<br />원본은 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : <><div className={styles.notice}>김춘자 / 이지영 … 폴더 이름 → 로그인 이름<br />각 폴더 안 JPG원본 → 그 사람만 보는 사진<br />그룹1, 그룹2 … → 고객에게 올리지 않음<br />개인1, 개인2 … → 이름을 바꾼 뒤 다시 올리기</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.<br />RAW 매칭은 각 이름 폴더 안에서 같은 파일 이름의 RAW를 찾아 촬영 폴더/Selected_RAW/이름 으로 복사합니다.</p></>}</aside>
      </div> : null}
      {tab === "settings" ? <section className={styles.panel} style={{ padding: 22 }}>
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${styles.fieldFull}`}><label>프로젝트명</label><input className={styles.input} value={data.event.title} onChange={(e) => setData({ ...data, event: { ...data.event, title: e.target.value } })} /></div>
          <div className={styles.field}><label>마감일 (KST)</label><input className={styles.input} type="datetime-local" value={formatSeoulDateTimeInput(data.event.deadline_at)} onChange={(e) => setData({ ...data, event: { ...data.event, deadline_at: e.target.value } })} /></div>
          <div className={styles.field}><label>상태</label><select className={styles.select} value={data.event.status} onChange={(e) => setData({ ...data, event: { ...data.event, status: e.target.value } })}><option value="draft">준비 중 (고객 접속 안 됨)</option><option value="open">열림 (고객 선택 가능)</option><option value="closed">마감</option></select></div>
          <div className={styles.field}><label>프로젝트 유형</label><select className={styles.select} value={data.event.project_type ?? "general"} onChange={(e) => setData({ ...data, event: { ...data.event, project_type: e.target.value as PersonSelectProjectType } })}>{Object.entries(PERSON_SELECT_PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className={styles.field}><label>접근 방식</label><select className={styles.select} value={data.event.access_mode ?? "individual"} onChange={(e) => setData({ ...data, event: { ...data.event, access_mode: e.target.value as PersonSelectAccessMode } })}>{Object.entries(PERSON_SELECT_ACCESS_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small className={styles.summary}>사진만 올린 상태는 그대로 유지하며 변경할 수 있습니다. 실제 접속·선택·메모·주문·제출이 있거나 개인별 소유자/PIN이 불완전하면 정확한 이유를 안내하고 변경을 막습니다.</small></div>
          <div className={styles.field}><label>고객 화면 방식</label><select className={styles.select} value={data.event.customer_view_mode ?? "classic"} onChange={(e) => setData({ ...data, event: { ...data.event, customer_view_mode: e.target.value as PersonSelectCustomerViewMode } })}>{Object.entries(PERSON_SELECT_CUSTOMER_VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}><label>원본 다운로드 NAS 공유 링크</label><input className={styles.input} type="url" inputMode="url" value={data.event.nas_download_url ?? ""} onChange={(event) => setData({ ...data, event: { ...data.event, nas_download_url: event.target.value } })} placeholder="https://..." /><small className={styles.summary}>기존 공유 링크 설정은 서버에만 보관합니다. 고객에게 NAS 주소를 직접 노출하지 않고, 권한이 있는 검토자의 요청만 Mac Studio가 원본 ZIP으로 준비해 5분짜리 다운로드 링크를 발급합니다.</small></div> : null}
          {isShared ? <label className={`${styles.check} ${styles.fieldFull}`}><input type="checkbox" checked={data.event.customer_ai_results_visible === true} onChange={(event) => setData({ ...data, event: { ...data.event, customer_ai_results_visible: event.target.checked } })} /> 고객에게 AI 품질 검사 결과 공개 (검토자별 권한도 필요)</label> : null}
          <div className={`${styles.field} ${styles.fieldFull}`}><label>사진선택 항목</label><div className={styles.groupRows}>{categories.map((category, index) => <div className={styles.groupRow} key={category.key}><input className={styles.input} aria-label="항목 이름" value={category.label} onChange={(e) => setData({ ...data, event: { ...data.event, categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item) } })} /><select className={styles.select} value={category.pick} onChange={(e) => setData({ ...data, event: { ...data.event, categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, pick: Number(e.target.value) } : item) } })}>{Array.from({ length: 50 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}장</option>)}</select><button type="button" className={styles.weak} disabled={categories.length <= 1} aria-label={`${category.label} 삭제`} onClick={() => setData({ ...data, event: { ...data.event, categories: categories.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 size={15} /></button></div>)}</div><button type="button" className={styles.secondary} style={{ marginTop: 10 }} onClick={() => setData({ ...data, event: { ...data.event, categories: [...categories, { key: `item_${Date.now()}`, label: "새 사진 항목", pick: 1 }] } })}><Plus size={14} />항목 추가</button><small className={styles.summary}>{isShared ? "공유 프로젝트의 항목은 안내·분류에 사용하며 사람별 수량으로 해석하지 않습니다." : "올라온 사진이 수량보다 적은 사람은 있는 만큼만 고르면 됩니다."}</small></div>
          {!isShared ? <OfferSettings event={data.event} onChange={(patch) => setData({ ...data, event: { ...data.event, ...patch } })} /> : null}
          <div className={`${styles.field} ${styles.fieldFull}`}><label>고객 화면 및 접속 안내</label><div className={styles.notice}>주소: {typeof location !== "undefined" ? location.origin : ""}{publicPath}<br />{loginGuide}.<br />화면: {PERSON_SELECT_CUSTOMER_VIEW_LABELS[data.event.customer_view_mode ?? "classic"]}<br />마감: {formatSeoulDeadline(data.event.deadline_at)}</div><div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>{isShared ? <button className={styles.weak} onClick={() => void regenerateSharedLink()}><RefreshCw size={15} />공용 링크 재발급</button> : null}</div></div>
          {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}>
            <label>검토자별 링크</label>
            <small className={styles.summary}>정연호, 클라이언트, 매니저처럼 사람마다 별도 링크를 발급합니다. 각 링크의 별점·컬러·메모·제출은 서로 섞이지 않고 대화만 함께 공유됩니다.</small>
            <div className={styles.reviewerCreate}><input className={styles.input} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="검토자 이름" /><input className={styles.input} value={reviewerRole} onChange={(event) => setReviewerRole(event.target.value)} placeholder="역할 (선택)" /><button type="button" className={styles.secondary} onClick={() => void createReviewer()}><Plus size={14} />검토자 추가</button></div>
            <div className={styles.reviewerList}>{sharedReviewers.map((reviewer) => {
              const issuedToken = issuedReviewerTokens[reviewer.id];
              const issuedLink = issuedToken && typeof location !== "undefined" ? `${location.origin}/pick/shared/${issuedToken}` : "";
              return <article className={styles.reviewerRow} key={reviewer.id} data-inactive={!reviewer.active || undefined}>
                <div><strong>{reviewer.display_name}</strong><span>{reviewer.role_label || (reviewer.is_legacy ? "기존 공용 링크 호환" : "검토자")}</span><small>{reviewer.selection ? `최종 제출 ${reviewer.selection.items.length}장` : `자동 저장 ${reviewer.draft?.selected_count ?? 0}장`} · 최근 접속 {relativeTime(reviewer.last_seen_at)}</small></div>
                {issuedLink ? <input className={styles.input} readOnly value={issuedLink} aria-label={`${reviewer.display_name} 발급 링크`} /> : <span className={styles.reviewerSecurity}>링크는 보안상 발급 직후에만 표시됩니다.</span>}
                <div className={styles.actions}><label className={styles.check}><input type="checkbox" checked={reviewer.can_view_ai_results === true} onChange={(event) => void setReviewerPermission(reviewer, "canViewAiResults", event.target.checked)} />AI 결과</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_jpg === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadJpg", event.target.checked)} />JPG 다운로드</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_raw === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadRaw", event.target.checked)} />RAW 다운로드</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_finalize === true} onChange={(event) => void setReviewerPermission(reviewer, "canFinalize", event.target.checked)} />최종 확정</label></div>
                <div className={styles.actions}>{issuedLink ? <button type="button" className={styles.secondary} onClick={() => void copyReviewerLink(reviewer.id)}><Clipboard size={14} />링크 복사</button> : null}{!reviewer.is_legacy ? <><button type="button" className={styles.weak} onClick={() => void regenerateReviewerLink(reviewer)}><RefreshCw size={14} />링크 재발급</button><button type="button" className={styles.weak} onClick={() => void setReviewerActive(reviewer, !reviewer.active)}>{reviewer.active ? "접속 중지" : "접속 허용"}</button></> : null}</div>
              </article>;
            })}</div>
          </div> : null}
        </div>
        <div className={styles.formActions}><button type="button" className={styles.danger} onClick={() => { setDeleteConfirmTitle(""); setDeleteOpen(true); }}><Trash2 size={15} />프로젝트 삭제</button><button className={styles.secondary} onClick={() => saveSettings({ title: data.event.title, deadline_at: data.event.deadline_at, status: data.event.status, categories, project_type: data.event.project_type ?? "general", access_mode: data.event.access_mode ?? "individual", customer_view_mode: data.event.customer_view_mode ?? "classic", nas_download_url: data.event.nas_download_url ?? null, customer_ai_results_visible: data.event.customer_ai_results_visible === true, offer_notice: data.event.offer_notice ?? "", extra_price: data.event.extra_price ?? 0, extra_max: data.event.extra_max ?? 0, offers: data.event.offers ?? [] })}>설정 저장</button></div>
      </section> : null}
    </section>
    {picker ? <PhotoSourcePicker targetWorker="jake-macstudio-01" sourceScope="person-select" onCancel={() => setPicker(false)} onSelectRemote={(selection) => { setPath(selection.path); setPicker(false); }} /> : null}
    {pinListOpen ? <PinListDialog eventId={id} onClose={() => setPinListOpen(false)} onUpdated={load} /> : null}
    {deleteOpen ? <div className={styles.modalBackdrop} onClick={() => { if (!deleting) setDeleteOpen(false); }}>
      <section className={`${styles.pinDialog} ${styles.deleteDialog}`} role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalTop}><div><p className={styles.eyebrow}>되돌릴 수 없는 작업</p><h2 id="delete-project-title">프로젝트 삭제</h2><p>사진, 참가자, 선택·주문·제출 기록과 업로드한 미리보기 파일을 함께 삭제합니다.</p></div><button type="button" className={styles.weak} aria-label="닫기" disabled={deleting} onClick={() => setDeleteOpen(false)}><X size={20} /></button></div>
        <div className={styles.warning} role="alert">삭제하려면 프로젝트명 <strong>{currentData.event.title}</strong>을 아래에 정확히 입력해 주세요. 업로드 중인 프로젝트는 삭제할 수 없습니다.</div>
        <div className={styles.field}><label htmlFor="delete-project-confirm">프로젝트명 확인</label><input id="delete-project-confirm" className={styles.input} autoFocus value={deleteConfirmTitle} disabled={deleting} onChange={(event) => setDeleteConfirmTitle(event.target.value)} autoComplete="off" /></div>
        <div className={styles.modalActions}><button type="button" className={styles.secondary} disabled={deleting} onClick={() => setDeleteOpen(false)}>취소</button><button type="button" className={styles.dangerSolid} disabled={deleting || deleteConfirmTitle.trim() !== currentData.event.title} onClick={() => void deleteProject()}>{deleting ? "삭제 중" : "영구 삭제"}</button></div>
      </section>
    </div> : null}
    {drawer ? <PersonDrawer person={data.people.find((person) => person.id === drawer.id) ?? drawer} personWord={isSchool ? "선생님" : ""} eventId={id} labels={labels} categoryLabels={categoryLabels} options={data.event.retouch_options} onClose={() => setDrawer(null)} onSaved={load} onPin={async () => { const body = await (await fetch(`/api/person-select/${id}/people/${drawer.id}/pin`, { method: "POST" })).json(); if (body.ok) setError(`${drawer.display_name} 새 비밀번호: ${body.pin}`); }} /> : null}
  </main>;
}

function PinListDialog({ eventId, onClose, onUpdated }: { eventId: string; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [people, setPeople] = useState<PinListPerson[]>([]);
  const [eventTitle, setEventTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [normalizing, setNormalizing] = useState(false);
  const [error, setError] = useState("");
  const loadPins = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/person-select/${eventId}/exports/pins?format=json`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "비밀번호 목록을 불러오지 못했습니다.");
      setEventTitle(String(body.eventTitle ?? ""));
      setPeople(Array.isArray(body.people) ? body.people : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호 목록을 불러오지 못했습니다.");
    } finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void loadPins(); }, [loadPins]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const normalizable = people.filter((person) => person.canAutoNormalize && person.loginName !== person.suggestedLoginName);
  async function normalizeNames() {
    if (!normalizable.length) return;
    const preview = normalizable.slice(0, 5).map((person) => `${person.loginName} → ${person.suggestedLoginName}`).join("\n");
    const more = normalizable.length > 5 ? `\n외 ${normalizable.length - 5}명` : "";
    if (!window.confirm(`로그인 이름에서 직책을 제외할까요?\n\n${preview}${more}\n\n폴더명, 표시 이름, PIN, 사진과 선택 기록은 그대로 유지됩니다.`)) return;
    setNormalizing(true); setError("");
    try {
      const response = await fetch(`/api/person-select/${eventId}/login-names`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || "로그인 이름을 변경하지 못했습니다.");
      await Promise.all([loadPins(), onUpdated()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "로그인 이름을 변경하지 못했습니다.");
    } finally { setNormalizing(false); }
  }
  return <div className={styles.modalBackdrop} onClick={onClose}>
    <section className={styles.pinDialog} role="dialog" aria-modal="true" aria-labelledby="pin-list-title" onClick={(event) => event.stopPropagation()}>
      <div className={styles.modalTop}><div><p className={styles.eyebrow}>개인별 접속 정보</p><h2 id="pin-list-title">비밀번호 목록</h2><p>{eventTitle || "프로젝트"} · {people.length.toLocaleString()}명</p></div><button type="button" className={styles.weak} aria-label="닫기" onClick={onClose}><X size={20} /></button></div>
      {error ? <div className={styles.warning} role="alert">{error}</div> : null}
      {loading ? <div className={styles.modalState}>비밀번호 목록을 불러오는 중이에요.</div> : people.length ? <div className={styles.pinTableWrap}><table className={styles.pinTable}><thead><tr><th>폴더·표시 이름</th><th>로그인 이름</th><th>그룹</th><th>PIN</th></tr></thead><tbody>{people.map((person) => <tr key={person.id}><td>{person.displayName}</td><td><strong>{person.loginName}</strong>{person.loginName !== person.suggestedLoginName ? <small>추천 {person.suggestedLoginName}</small> : null}</td><td>{person.groupLabel || "—"}</td><td><code>{person.pin}</code></td></tr>)}</tbody></table></div> : <div className={styles.modalState}>등록된 사람이 없어요.</div>}
      <div className={styles.modalActions}>
        <a className={styles.secondary} href={`/api/person-select/${eventId}/exports/pins`}><Download size={15} />CSV 다운로드</a>
        {normalizable.length ? <button type="button" className={styles.primary} disabled={normalizing} onClick={() => void normalizeNames()}><RefreshCw size={15} />{normalizing ? "변경 중" : `직책 제외 적용 (${normalizable.length}명)`}</button> : null}
      </div>
    </section>
  </div>;
}

function PersonDrawer({ person, personWord, eventId, labels, categoryLabels, options, onClose, onSaved, onPin }: { person: Person; personWord: string; eventId: string; labels: Map<string, string>; categoryLabels: Map<string, string>; options: { key: string; label: string }[]; onClose: () => void; onSaved: () => Promise<void>; onPin: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [keys, setKeys] = useState<string[]>([]);
  async function save(choice: Choice) {
    const response = await fetch(`/api/person-select/${eventId}/choices/${choice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retouch_keys: keys, memo }) });
    if (!response.ok) return; setEditing(null); await onSaved();
  }
  return <div className={styles.drawerBackdrop} onClick={onClose}><aside className={styles.drawer} onClick={(e) => e.stopPropagation()}><div className={styles.drawerTop}><div><p className={styles.eyebrow}>상세</p><h2>{person.display_name}{personWord ? ` ${personWord}` : ""}</h2></div><button className={styles.weak} onClick={onClose}><X /></button></div>{person.choices.map((choice) => <section className={styles.choiceDetail} key={choice.id}>{choice.person_select_images ? <img src={choice.person_select_images.thumb_url} alt="고른 사진" /> : null}<h3>{categoryLabels.get(choice.category_key) ?? choice.category_key}</h3><p>{choice.person_select_images?.original_file_name}</p>{editing === choice.id ? <><div className={styles.chipGrid}>{options.map((option) => <button key={option.key} className={`${styles.chip} ${keys.includes(option.key) ? styles.chipActive : ""}`} onClick={() => setKeys(keys.includes(option.key) ? keys.filter((key) => key !== option.key) : [...keys, option.key])}>{option.label}</button>)}</div><textarea className={styles.textarea} value={memo} onChange={(e) => setMemo(e.target.value)} /><div className={styles.actions} style={{ justifyContent: "flex-start", marginTop: 10 }}><button className={styles.primary} onClick={() => void save(choice)}>관리자 수정 저장</button><button className={styles.secondary} onClick={() => setEditing(null)}>취소</button></div></> : <><p>{choice.retouch_keys.map((key) => labels.get(key) || key).join(" / ") || "기본 보정"}</p><p>{choice.memo || "메모 없음"}</p><button className={styles.secondary} onClick={() => { setEditing(choice.id); setKeys(choice.retouch_keys); setMemo(choice.memo); }}>관리자 수정</button></>}</section>)}{person.order?.lines.length ? <section className={styles.choiceDetail}><h3>추가 주문 · {won(person.order.total)}</h3>{person.order.lines.map((line, index) => <p key={index}>{line.label}{line.detail ? ` · ${line.detail}` : ""} — {line.qty} × {won(line.unitPrice)} = {won(line.amount)}</p>)}</section> : null}<button className={styles.secondary} style={{ marginTop: 18 }} onClick={() => void onPin()}><RefreshCw size={15} style={{ verticalAlign: -3, marginRight: 5 }} />PIN 재발급</button></aside></div>;
}

function RawMatchResult({ result, at }: { result: Record<string, unknown> | null; at: string | null }) {
  if (!result) return null;
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  if (result.message && result.matchedCount === undefined) return <div className={styles.result}>{String(result.message)}</div>;
  if (result.error) return <div className={styles.warning}>RAW 매칭: {String(result.error)}</div>;
  const missing = list(result.missing); const ambiguous = list(result.ambiguous); const conflicts = list(result.conflicts); const notSubmitted = Array.isArray(result.notSubmitted) ? result.notSubmitted.map(String) : [];
  return <div className={styles.result}>
    <div>{`RAW 매칭${at ? ` (${new Date(at).toLocaleString("ko-KR")})` : ""} · 제출 ${Number(result.submittedPeople ?? 0)}명 · 고른 사진 ${Number(result.selectedCount ?? 0)}장 · 새로 복사 ${Number(result.matchedCount ?? 0)}장 · 이미 있음 ${Number(result.alreadyCopiedCount ?? 0)}장 → 촬영 폴더/${String(result.outputRelativePath ?? "Selected_RAW")}`}</div>
    {notSubmitted.length ? <div className={styles.skippedFolders}>미제출로 빠진 사람: {notSubmitted.join(" / ")}</div> : null}
    {missing.length ? <ul className={styles.failureList}>{missing.map((item, index) => <li key={`m-${index}`}>{String(item.name)} · {String(item.jpg)}: RAW를 찾지 못했어요</li>)}</ul> : null}
    {ambiguous.length ? <ul className={styles.failureList}>{ambiguous.map((item, index) => <li key={`a-${index}`}>{String(item.name)} · {String(item.jpg)}: 같은 이름의 RAW가 여러 개라 직접 확인이 필요해요 ({Array.isArray(item.candidates) ? item.candidates.length : 0}개)</li>)}</ul> : null}
    {conflicts.length ? <ul className={styles.failureList}>{conflicts.map((item, index) => <li key={`c-${index}`}>{String(item.name)} · {String(item.raw)}: 같은 이름의 다른 파일이 이미 있어 덮어쓰지 않았어요</li>)}</ul> : null}
  </div>;
}

/** "6R (6x8inch) = 30000" 한 줄을 선택지로 읽는다. 3만, 30,000원 같은 표기도 받는다. */
function parsePrice(text: string) {
  const value = text.replace(/[,\s원]/g, "");
  const man = value.match(/^(\d+(?:\.\d+)?)만$/);
  if (man) return Math.round(Number(man[1]) * 10_000);
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

function optionsToText(offer: PersonSelectOffer) {
  return offer.options.map((option) => `${option.label} = ${option.price}`).join("\n");
}

function textToOptions(text: string, previous: PersonSelectOffer["options"]) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const at = line.lastIndexOf("=");
    const label = (at >= 0 ? line.slice(0, at) : line).trim();
    const price = at >= 0 ? parsePrice(line.slice(at + 1)) : NaN;
    // 이미 받은 주문이 끊기지 않게 같은 이름의 선택지는 기존 구분값을 그대로 쓴다.
    const key = previous.find((option) => option.label === label)?.key ?? `opt-${Date.now().toString(36)}-${index}`;
    return { key, label, price: Number.isFinite(price) ? price : -1 };
  });
}

/** 행사 설정: 고객 안내 문구, 추가 보정 가격, 신청받을 상품 */
function OfferSettings({ event, onChange }: { event: EventData; onChange: (patch: Partial<EventData>) => void }) {
  const offers = event.offers ?? [];
  const [optionTexts, setOptionTexts] = useState<Record<string, string>>(() => Object.fromEntries(offers.map((offer) => [offer.key, optionsToText(offer)])));
  const empty = !event.offer_notice && !event.extra_price && !offers.length;
  const setOffer = (index: number, patch: Partial<PersonSelectOffer>) => onChange({ offers: offers.map((offer, offerIndex) => offerIndex === index ? { ...offer, ...patch } : offer) });
  function fillDefaults() {
    onChange({ offer_notice: DEFAULT_PERSON_SELECT_NOTICE, extra_price: DEFAULT_PERSON_SELECT_EXTRA_PRICE, extra_max: DEFAULT_PERSON_SELECT_EXTRA_MAX, offers: DEFAULT_PERSON_SELECT_OFFERS });
    setOptionTexts(Object.fromEntries(DEFAULT_PERSON_SELECT_OFFERS.map((offer) => [offer.key, optionsToText(offer)])));
  }
  function addOffer() {
    const key = `offer-${Date.now().toString(36)}`;
    onChange({ offers: [...offers, { key, label: "", unit: "개", price: 0, note: "", needs_photo: false, options: [] }] });
    setOptionTexts({ ...optionTexts, [key]: "" });
  }
  return <div className={`${styles.field} ${styles.fieldFull}`}>
    <label>고객 안내 · 추가 주문</label>
    <div className={styles.offerBox}>
      {empty ? <div className={styles.offerEmpty}><span>아직 안내 문구와 상품이 없어요.</span><button className={styles.secondary} onClick={fillDefaults}>기본값 불러오기 (추가 보정 5만원 · 액자 · 앨범)</button></div> : null}
      <div className={styles.field}><small className={styles.summary}>고객 화면 맨 위에 보이는 글</small><textarea className={styles.textarea} maxLength={2000} value={event.offer_notice ?? ""} onChange={(e) => onChange({ offer_notice: e.target.value })} placeholder="예: 한 분당 보정본 1장을 드립니다." /></div>
      <div className={styles.offerRow}>
        <div className={styles.field}><small className={styles.summary}>추가 보정 가격 (장당, 0이면 추가로 못 고름)</small><input className={styles.input} inputMode="numeric" value={event.extra_price ?? 0} onChange={(e) => onChange({ extra_price: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></div>
        <div className={styles.field}><small className={styles.summary}>더 고를 수 있는 최대 장수</small><select className={styles.select} value={event.extra_max ?? 0} onChange={(e) => onChange({ extra_max: Number(e.target.value) })}>{Array.from({ length: 21 }, (_, n) => <option key={n} value={n}>{n}장</option>)}</select></div>
      </div>
      {offers.map((offer, index) => <div key={offer.key} className={styles.offerItem}>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>상품 이름</small><input className={styles.input} value={offer.label} onChange={(e) => setOffer(index, { label: e.target.value })} placeholder="예: 액자 제작" /></div>
          <div className={styles.field}><small className={styles.summary}>단위</small><input className={styles.input} value={offer.unit} onChange={(e) => setOffer(index, { unit: e.target.value })} placeholder="개, 권" /></div>
          <div className={styles.field}><small className={styles.summary}>가격 (크기 선택지가 없을 때)</small><input className={styles.input} inputMode="numeric" value={offer.price} onChange={(e) => setOffer(index, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })} disabled={Boolean(offer.options.length)} /></div>
        </div>
        <div className={styles.offerRow}>
          <div className={styles.field}><small className={styles.summary}>크기·종류 선택지 (한 줄에 하나: 이름 = 가격)</small><textarea className={styles.textarea} value={optionTexts[offer.key] ?? optionsToText(offer)} onChange={(e) => { setOptionTexts({ ...optionTexts, [offer.key]: e.target.value }); setOffer(index, { options: textToOptions(e.target.value, offer.options) }); }} placeholder={"6R (6x8inch) = 30000\n16R (16x20inch) = 100000"} /></div>
          <div className={styles.field}><small className={styles.summary}>구성 설명 (고객에게 보임)</small><textarea className={styles.textarea} value={offer.note} onChange={(e) => setOffer(index, { note: e.target.value })} placeholder={"20P 블랙가죽\n5x7inch 액자 포함"} /></div>
        </div>
        <div className={styles.offerFoot}>
          <label className={styles.check}><input type="checkbox" checked={offer.needs_photo} onChange={(e) => setOffer(index, { needs_photo: e.target.checked })} /> 고객이 고른 사진 중 하나를 지정 (액자 등)</label>
          <button className={styles.weak} onClick={() => onChange({ offers: offers.filter((_, offerIndex) => offerIndex !== index) })}><Trash2 size={14} /> 상품 빼기</button>
        </div>
        {offer.options.some((option) => option.price < 0) ? <p className={styles.disabledReason}>가격을 읽지 못한 줄이 있어요. &quot;이름 = 30000&quot; 처럼 적어주세요.</p> : null}
      </div>)}
      <button className={styles.secondary} onClick={addOffer}><Plus size={15} />상품 추가</button>
    </div>
  </div>;
}
