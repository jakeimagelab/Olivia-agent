"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, Clipboard, Download, Folder, FolderOpen, Info, Link2, Monitor, MoreHorizontal, Plus, RefreshCw, Server, SlidersHorizontal, Trash2, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { formatSeoulDeadline, formatSeoulDateTimeInput } from "@/lib/person-select/date";
import { type PersonSelectAccessMode, type PersonSelectCustomerViewMode, type PersonSelectProjectType } from "@/lib/person-select/types";
import { collectLocalPersonSelectFileList, collectLocalPersonSelectFolder, type LocalPersonSelectScan } from "@/lib/person-select/localImport";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import { usePersonSelectUploadManager } from "@/components/person-select/upload/PersonSelectUploadManager";
import { PERSON_SELECT_ACCESS_MODE_LABELS, PERSON_SELECT_CUSTOMER_VIEW_LABELS, PERSON_SELECT_PROJECT_TYPE_LABELS } from "@/lib/person-select/projectSettings";
import { PERSON_SELECT_RAW_LABEL_NAMES, resolveIndividualRawMatchTargets, resolvePersonSelectRawMatchPathPlan, resolveSharedRawMatchTargets, type PersonSelectRawLabelNames, type PersonSelectRawMatchMode, type PersonSelectRawMatchSource } from "@/lib/person-select/rawMatch";
import { canPersonSelectReviewerFinalize } from "@/lib/person-select/reviewerPermissions";
import { formatRelativeTime, formatWon } from "@/lib/person-select/format";
import type { PersonSelectAdminPerson as Person } from "@/lib/person-select/adminPerson";
import { readApiResponse } from "@/lib/http/apiResponse";
import { loadRemoteWorkerStatus } from "@/lib/remote-jobs/workerStatusClient";
import CustomerBridgeSelect, { type CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import { RawMatchDialog, RawMatchResult } from "@/components/person-select/admin/RawMatchControls";
import { PinListDialog } from "@/components/person-select/admin/PinListDialog";
import { PersonDetailDrawer } from "@/components/person-select/admin/PersonDetailDrawer";
import { OfferSettings } from "@/components/person-select/admin/OfferSettings";
import { resolveRemoteJobResult, useRemoteJobPoller } from "@/components/person-select/admin/hooks/useRemoteJobPoller";
import { SelectionSyncDialog } from "@/components/person-select/admin/SelectionSyncDialog";
import { DeliveryImportResult } from "@/components/person-select/upload/DeliveryImportResult";
import { usePersonSelectAdminData } from "@/components/person-select/admin/hooks/usePersonSelectAdminData";
import { usePersonSelectReviewerActions } from "@/components/person-select/admin/hooks/usePersonSelectReviewerActions";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type Layout = "school" | "person-folders" | "project";
type SourceMode = "local" | "remote";
type Filter = "all" | "done" | "saving" | "unseen" | "delivery_revision";
type UploadKind = "original" | "delivery";

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
  const [tab, setTab] = useState<"matching" | "progress" | "upload" | "settings">("matching");
  const [filter, setFilter] = useState<Filter>("all");
  const [picker, setPicker] = useState(false);
  const [path, setPath] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("local");
  const [uploadKind, setUploadKind] = useState<UploadKind>("original");
  const [localFolderName, setLocalFolderName] = useState("");
  const [localScan, setLocalScan] = useState<LocalPersonSelectScan | null>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const handledUploadJobRef = useRef<string | null>(null);
  const uploadManager = usePersonSelectUploadManager();
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [jobId, setJobId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [deliveryJobId, setDeliveryJobId] = useState("");
  const [deliveryResult, setDeliveryResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Person | null>(null);
  const [pinListOpen, setPinListOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deliveryAssignments, setDeliveryAssignments] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<Layout | null>(null);
  const [rawJobId, setRawJobId] = useState("");
  const [rawResult, setRawResult] = useState<Record<string, unknown> | null>(null);
  const [rawDialogOpen, setRawDialogOpen] = useState(false);
  const [rawMode, setRawMode] = useState<PersonSelectRawMatchMode>("copy");
  const [rawSource, setRawSource] = useState<PersonSelectRawMatchSource>("submitted");
  const [rawLabelNames, setRawLabelNames] = useState<PersonSelectRawLabelNames>({ ...PERSON_SELECT_RAW_LABEL_NAMES });
  const [rawReviewerScope, setRawReviewerScope] = useState("all");
  const rawOptionsLoadedRef = useRef(false);
  const rawOptionsSkipFirstWriteRef = useRef(true);
  const rawSourceSavedRef = useRef(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const navigate = (href: string) => windowRoute.navigate ? windowRoute.navigate(href, "개인별 사진 셀렉") : router.push(href);
  const {
    data,
    setData,
    load,
    assignments,
    setAssignments,
    selectedReviewerId,
    setSelectedReviewerId,
  } = usePersonSelectAdminData({ eventId: id, onError: setError });
  const loadSharedImageUrls = useCallback(async (imageIds: string[], options?: { variant: SelectionMediaVariant }) => {
    const response = await fetch(`/api/person-select/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds, variant: options?.variant }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || "사진 주소를 불러오지 못했습니다.");
    return body.images as Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;
  }, [id]);
  useEffect(() => {
    loadRemoteWorkerStatus<{ worker?: { online?: boolean } }>()
      .then((body) => setWorkerOnline(body.worker?.online ?? false))
      .catch(() => setWorkerOnline(false));
  }, []);
  useEffect(() => {
    rawOptionsLoadedRef.current = false;
    rawOptionsSkipFirstWriteRef.current = true;
    rawSourceSavedRef.current = false;
    try {
      const raw = localStorage.getItem(`olivia-person-select-raw-options:${id}`);
      const stored = JSON.parse(raw ?? "{}") as {
        mode?: PersonSelectRawMatchMode;
        source?: PersonSelectRawMatchSource;
        labelNames?: Partial<Record<"6" | "7" | "8" | "9", string>>;
      };
      if (stored.mode === "copy" || stored.mode === "mark") setRawMode(stored.mode);
      if (stored.source === "submitted" || stored.source === "current") {
        setRawSource(stored.source);
        rawSourceSavedRef.current = true;
      }
      if (stored.labelNames) setRawLabelNames({
        6: stored.labelNames[6]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[6],
        7: stored.labelNames[7]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[7],
        8: stored.labelNames[8]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[8],
        9: stored.labelNames[9]?.trim() || PERSON_SELECT_RAW_LABEL_NAMES[9],
      });
    } catch {
      // 브라우저 저장소가 막힌 환경에서도 기본값으로 계속 진행한다.
    } finally {
      rawOptionsLoadedRef.current = true;
    }
  }, [id]);
  useEffect(() => {
    if (!rawOptionsLoadedRef.current) return;
    if (rawOptionsSkipFirstWriteRef.current) { rawOptionsSkipFirstWriteRef.current = false; return; }
    try {
      localStorage.setItem(`olivia-person-select-raw-options:${id}`, JSON.stringify({ mode: rawMode, source: rawSource, labelNames: rawLabelNames }));
    } catch {
      // 저장소 접근 실패는 실행 자체를 막지 않는다.
    }
  }, [id, rawLabelNames, rawMode, rawSource]);
  useRemoteJobPoller({
    jobId,
    label: "사진 가져오기 상태",
    onTerminal: async (job) => {
      setResult(resolveRemoteJobResult(job));
      setJobId("");
      await load();
      if (job.status === "COMPLETED") setTab("matching");
    },
  });
  useRemoteJobPoller({
    jobId: deliveryJobId,
    label: "보정본 가져오기 상태",
    onTerminal: async (job) => {
      const nextResult = resolveRemoteJobResult(job, "보정본 가져오기에 실패했습니다.");
      setDeliveryResult(nextResult);
      if (job.status !== "COMPLETED") {
        setError(`보정본 가져오기 실패: ${String(nextResult.error ?? job.error ?? "작업 결과를 확인해 주세요.")}`);
      }
      setDeliveryJobId("");
      await load();
    },
  });
  useRemoteJobPoller({
    jobId: rawJobId,
    label: "RAW 매칭 상태",
    onTerminal: async (job) => {
      setRawJobId("");
      setRawResult(resolveRemoteJobResult(job));
      await load();
    },
  });
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
    if (filter === "saving") return person.status_label === "선택 중";
    if (filter === "unseen") return person.status_label === "미접속";
    if (filter === "delivery_revision") return Number(person.delivery_revision_count ?? 0) > 0;
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
        ? `${selectedPerson.display_name} · ${selectedPerson.status_label} · 고른 사진 ${selectedPerson.choices.length} / ${need}장 · 보정 요청 ${retouch}개${selectedPerson.order?.total ? ` · 추가 주문 ${formatWon(selectedPerson.order.total)}` : ""}`
        : `마감 ${formatSeoulDeadline(data.event.deadline_at)} · ${data.people.length}명`,
      next: memos.length ? memos.join(" / ") : "행사 진행 현황과 고객 선택을 확인합니다.",
      context: { contextScope: "none", routeHref: `/person-select/${data.event.id}`, resourceId: data.event.id, resourceType: "person-select-event", documentTitle: data.event.title, featureItemId: selectedPerson?.id ?? data.event.id },
      featureItemId: selectedPerson?.id ?? data.event.id,
    });
  }, [selectedPerson, data]);
  const isShared = data?.event.access_mode === "project_shared";
  const {
    reviewerName,
    setReviewerName,
    reviewerRole,
    setReviewerRole,
    issuedReviewerTokens,
    regenerateSharedLink,
    createReviewer,
    regenerateReviewerLink,
    setReviewerActive,
    setReviewerPermission,
    copyReviewerLink,
  } = usePersonSelectReviewerActions({
    eventId: id,
    isShared,
    load,
    setSelectedReviewerId,
    setMessage: setError,
  });
  if (!data) return <main className={styles.shell}><div className={styles.loading}>{error || "행사를 불러오는 중이에요"}</div></main>;
  const currentData = data;
  // 가져오기 방식: 이미 가져온 행사는 그때 방식, 처음이면 이름 폴더 방식
  const sharedReviewers = data.shared?.reviewers ?? [];
  const selectedReviewer = sharedReviewers.find((reviewer) => reviewer.id === selectedReviewerId) ?? sharedReviewers[0] ?? null;
  const selectedSharedSelection = selectedReviewer?.selection ?? null;
  const displayedSharedItems = selectedSharedSelection?.items ?? selectedReviewer?.draft?.items ?? [];
  const displayedSharedMemo = selectedSharedSelection?.customer_memo ?? selectedReviewer?.draft?.customerMemo ?? "";
  const currentLayout: Layout = layout ?? (isShared ? "project" : data.people.length && data.event.source_layout === "school" ? "school" : "person-folders");
  const isSchool = currentLayout === "school";
  const personWord = isSchool ? "선생님" : "이름";
  const categories = data.event.categories ?? [];
  const categoryLabels = new Map(categories.map((item) => [item.key, item.label]));
  const counts = { done: data.people.filter((person) => person.status_label.includes("제출")).length, saving: data.people.filter((person) => person.status_label === "선택 중").length, unseen: data.people.filter((person) => person.status_label === "미접속").length, deliveryRevision: data.people.filter((person) => Number(person.delivery_revision_count ?? 0) > 0).length };
  const totalPhotos = isShared ? Number(data.shared?.image_count ?? 0) : data.people.reduce((sum, person) => sum + Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((acc, [, value]) => acc + value, 0), 0);
  const pickText = isShared ? `프로젝트 공용 셀렉 · 검토자 ${sharedReviewers.filter((reviewer) => !reviewer.is_legacy).length}명` : categories.length === 1 ? `한 사람당 ${categories[0].pick}장` : categories.map((item) => `${item.label} ${item.pick}장`).join(" · ");
  const sourceFolder = folderName(data.event.source_relative_path);
  const rawPathPlan = resolvePersonSelectRawMatchPathPlan(
    data.event.source_relative_path ?? "",
    isShared ? "프로젝트" : "<이름>",
  );
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
    try {
      const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_IMPORT", payload: isSchool ? { event_id: id, source_relative_path: path, mappings: [{ folder: "선생님프로필", category: "profile", owner: "person" }, { folder: "담임선생님", category: "homeroom", owner: "group" }] } : { event_id: id, source_relative_path: path, layout: currentLayout } }) });
      const body = await readApiResponse<{ job?: { id?: string }; id?: string }>(response, "사진 가져오기");
      setJobId(body.job?.id || body.id || "");
      setResult({ message: "사진 가져오기를 시작했어요." });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "사진 가져오기를 시작하지 못했습니다.");
    }
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
  async function startDeliveryImport() {
    if (!path) return setError("Mac Studio의 보정본 폴더를 선택해 주세요.");
    setError(""); setDeliveryResult(null);
    try {
      const response = await fetch(`/api/person-select/${id}/deliveries/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourcePath: path }),
      });
      const body = await readApiResponse<{ job?: { id?: string } }>(response, "보정본 가져오기");
      setDeliveryJobId(body.job?.id ?? "");
      setDeliveryResult({ message: "보정본 원본과 미리보기를 안전하게 올리고 있어요." });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본 가져오기를 시작하지 못했습니다.");
    }
  }
  async function assignDelivery(deliveryId: string) {
    const value = deliveryAssignments[deliveryId]?.trim() ?? "";
    if (!value) return setError(isShared ? "연결할 폴더 이름을 입력해 주세요." : "연결할 고객을 선택해 주세요.");
    try {
      const response = await fetch(`/api/person-select/${id}/deliveries/${deliveryId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isShared ? { groupLabel: value } : { personId: value }),
      });
      await readApiResponse(response, "보정본 연결");
      setDeliveryAssignments((current) => { const next = { ...current }; delete next[deliveryId]; return next; });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본 연결을 저장하지 못했습니다.");
    }
  }
  async function changeDeliveryOwner(action: "reopen" | "extend", personId?: string) {
    try {
      const endpoint = action === "reopen" ? "state" : "retention";
      const response = await fetch(`/api/person-select/${id}/deliveries/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reopen" ? { action: "reopen", personId } : { personId }),
      });
      await readApiResponse(response, action === "reopen" ? "보정본 다시 열기" : "보관 기간 연장");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본 상태를 바꾸지 못했습니다.");
    }
  }
  async function startRawMatch(clearMark = false) {
    setError(""); setRawResult(null);
    const payload = {
      event_id: id,
      mode: clearMark ? "mark" : rawMode,
      source: rawSource,
      labelNames: rawLabelNames,
      ...(clearMark ? { clear_mark: true } : {}),
      ...(isShared && rawReviewerScope !== "all" ? { reviewerIds: [rawReviewerScope] } : {}),
    };
    let body: { job?: { id?: string }; id?: string };
    try {
      const response = await fetch("/api/remote-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "PERSON_SELECT_RAW_MATCH", payload }) });
      body = await readApiResponse(response, "RAW 매칭");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "RAW 매칭을 시작하지 못했습니다.");
      return;
    }
    setRawDialogOpen(false);
    setRawJobId(body.job?.id || body.id || "");
    setRawResult({ message: clearMark
      ? "로우 셀렉 표시를 이전 값으로 복원하고 있어요."
      : rawMode === "mark"
        ? "고객 별점과 컬러를 원본 RAW의 XMP에 기록하고 있어요."
        : rawSource === "current" ? "제출 전 선택을 포함해 RAW 매칭을 시작했어요." : "최종 제출본 RAW 매칭을 시작했어요." });
  }
  async function saveGroups() {
    try {
      const response = await fetch(`/api/person-select/${id}/groups`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: currentData.groups.map((group) => ({ group: group.label, person_id: assignments[group.label] || null })) }) });
      await readApiResponse(response, "인원 연결 저장");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "인원 연결을 저장하지 못했습니다.");
    }
  }
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
  const labels = new Map(data.event.retouch_options.map((item) => [item.key, item.label]));
  const loginGuide = isShared ? "공용 링크에서 프로젝트 사진을 함께 선택해 주세요" : isSchool ? "이름과 학교에서 받은 비밀번호 4자리로 들어오세요" : "이름과 포토클리닉에서 받은 비밀번호 4자리로 들어오세요";
  const publicPath = isShared && data.event.shared_token ? `/pick/shared/${data.event.shared_token}` : `/pick/${data.event.slug}`;
  const notice = `주소: ${typeof location !== "undefined" ? location.origin : ""}${publicPath} / ${loginGuide} / 마감: ${formatSeoulDeadline(data.event.deadline_at)}`;
  const tabs = isShared
    ? [["matching", "사진 확인", UsersRound], ["progress", "고객 셀렉", Activity], ["upload", "사진 올리기", Upload], ["settings", "프로젝트 설정", SlidersHorizontal]] as const
    : [["matching", "인원 매칭", UsersRound], ["progress", "진행 현황", Activity], ["upload", "사진 올리기", Upload], ["settings", "프로젝트 설정", SlidersHorizontal]] as const;
  const filters: [Filter, string, number][] = [["all", "전체", data.people.length], ["done", "제출 완료", counts.done], ["saving", "선택 중", counts.saving], ["unseen", "미접속", counts.unseen], ["delivery_revision", "수정 요청", counts.deliveryRevision]];
  const groupFolders = Array.isArray(result?.groupFolders) ? (result.groupFolders as unknown[]).map(String) : [];
  const unnamedFolders = Array.isArray(result?.unnamedFolders) ? (result.unnamedFolders as unknown[]).map(String) : [];
  const rawBusy = Boolean(rawJobId);
  const sharedImageById = new Map((data.shared?.images ?? []).map((image) => [image.id, {
    id: image.id,
    originalFileName: image.original_file_name,
    sourceRelPath: image.relative_path ?? image.original_file_name,
  }]));
  const sharedSubmittedByReviewer = new Map(sharedReviewers.map((reviewer) => [reviewer.id, (reviewer.selection?.items ?? []).flatMap((item) => {
    const image = sharedImageById.get(item.image_id);
    return image ? [{
      ...image,
      customerRating: item.customer_rating ?? 1,
      customerColorLabel: item.customer_color_label ?? null,
      markSavedAt: reviewer.selection?.submitted_at ?? null,
    }] : [];
  })]));
  const sharedDraftByReviewer = new Map(sharedReviewers.flatMap((reviewer) => reviewer.draft ? [[reviewer.id, reviewer.draft.selectedImageIds.flatMap((imageId) => {
    const image = sharedImageById.get(imageId);
    return image ? [{
      ...image,
      customerRating: reviewer.draft?.ratings?.[imageId] ?? 1,
      customerColorLabel: reviewer.draft?.colorLabels?.[imageId] ?? null,
      markSavedAt: reviewer.draft?.updated_at ?? null,
    }] : [];
  })] as const] : []));
  const sharedRawInput = {
    reviewers: sharedReviewers.map((reviewer) => ({ id: reviewer.id, displayName: reviewer.display_name, active: reviewer.active })),
    reviewerIds: rawReviewerScope === "all" ? undefined : [rawReviewerScope],
    submittedByReviewer: sharedSubmittedByReviewer,
    draftByReviewer: sharedDraftByReviewer,
  };
  const individualRawInput = {
    people: data.people.map((person) => ({ id: person.id, displayName: person.display_name, submittedAt: person.submitted_at })),
    choices: data.people.flatMap((person) => person.choices.map((choice) => ({
      personId: person.id,
      image: choice.person_select_images ? { id: choice.image_id, originalFileName: choice.person_select_images.original_file_name, sourceRelPath: choice.person_select_images.source_rel_path } : null,
    }))),
  };
  const rawPreview = isShared
    ? resolveSharedRawMatchTargets({ source: rawSource, ...sharedRawInput })
    : resolveIndividualRawMatchTargets({ source: rawSource, ...individualRawInput });
  const rawSubmittedAll = isShared
    ? resolveSharedRawMatchTargets({ source: "submitted", ...sharedRawInput, reviewerIds: undefined })
    : resolveIndividualRawMatchTargets({ source: "submitted", ...individualRawInput });
  const rawCurrentAll = isShared
    ? resolveSharedRawMatchTargets({ source: "current", ...sharedRawInput, reviewerIds: undefined })
    : resolveIndividualRawMatchTargets({ source: "current", ...individualRawInput });
  const hasRawSelection = rawSubmittedAll.targets.length > 0 || rawCurrentAll.targets.length > 0;
  const rawDisabledReason = !hasRawSelection ? "고른 사진이 없어요." : !data.event.source_relative_path ? "원본 폴더를 Mac Studio 위치로 연결해 주세요." : workerOnline === null ? "Mac Studio 상태를 확인하고 있어요." : workerOnline === false ? "Mac Studio가 꺼져 있어요." : "";
  const rawDisabled = rawBusy || Boolean(rawDisabledReason);
  function openRawMatchDialog() {
    const defaultSource = rawSubmittedAll.targets.length === 0 && rawCurrentAll.targets.length > 0 ? "current" : "submitted";
    if (!rawSourceSavedRef.current) setRawSource(defaultSource);
    setRawReviewerScope("all");
    setRawDialogOpen(true);
  }
  const rawAction = <button className={styles.bridgeRawButton} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={openRawMatchDialog}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button>;
  const displayedRawResult = rawResult ?? data.event.raw_match_result ?? null;
  const rawStatus = rawDisabledReason || displayedRawResult ? <>{rawDisabledReason ? <p className={styles.rawDisabledReason}>{rawDisabledReason}</p> : null}<RawMatchResult result={displayedRawResult} at={rawResult ? null : data.event.raw_matched_at ?? null} busy={rawBusy} onClear={() => void startRawMatch(true)} onRetry={openRawMatchDialog} /></> : null;
  const finalizeReviewerCount = sharedReviewers.filter((reviewer) => reviewer.active && canPersonSelectReviewerFinalize(reviewer)).length;
  return <main className={styles.shell}>
    <section className={styles.body}>
      <div className={styles.crumb}><button className={styles.crumbBack} onClick={() => navigate("/person-select")}><ArrowLeft size={14} />사진선택</button>{sourceFolder ? <><span aria-hidden="true">›</span><span>{sourceFolder}</span></> : null}</div>
      <div className={styles.titleRow}>
        <div><h1 className={styles.title}>{data.event.title}</h1><p className={styles.subtitle}>마감 {formatSeoulDeadline(data.event.deadline_at)} · {isShared ? PERSON_SELECT_ACCESS_MODE_LABELS.project_shared : `${data.people.length}명`} · {pickText}{totalPhotos ? ` · 사진 ${totalPhotos.toLocaleString()}장` : ""}</p></div>
      </div>
      <div className={styles.segmentRow}>
        <div className={styles.segment} role="tablist">{tabs.map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? styles.segmentActive : ""} onClick={() => setTab(key)}><Icon size={15} />{label}</button>)}</div>
        <div className={styles.tabActions}>
          <button className={styles.secondary} onClick={() => setSyncDialogOpen(true)}><RefreshCw size={15} />동기화 확인</button>
          <button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>
          {!isShared ? <div className={styles.desktopAuxActions}><button type="button" className={styles.secondary} onClick={() => setPinListOpen(true)}><UserRound size={15} />비밀번호 목록</button><a className={styles.secondary} href={`/api/person-select/${id}/exports/retouch`}><Download size={15} />보정 목록 CSV</a><a className={styles.secondary} href={`/api/person-select/${id}/exports/orders`}><Download size={15} />주문 CSV</a></div> : null}
          {!isShared ? <details className={styles.moreMenu}><summary><MoreHorizontal size={16} />더보기</summary><div><button type="button" onClick={() => setPinListOpen(true)}>비밀번호 목록</button><a href={`/api/person-select/${id}/exports/retouch`}>보정 목록 CSV</a><a href={`/api/person-select/${id}/exports/orders`}>주문 CSV</a></div></details> : null}
        </div>
      </div>
      {error ? <div className={styles.warning}>{error}</div> : null}
      {data.sync?.recent_failure_count ? <div className={styles.warning} role="alert">최근 고객 저장 실패 {data.sync.recent_failure_count}건이 있습니다. 동기화 확인에서 검토해 주세요.</div> : null}
      {tab === "matching" && isShared ? <section className={styles.matchingPanel}>
        <div className={styles.matchingHeader}><div><h2>프로젝트 사진 확인</h2><p>검토자별 셀렉은 서로 독립적으로 보존되며 오른쪽 대화 탭은 모든 참여자가 함께 사용합니다.</p></div><div className={styles.actions}>{sharedReviewers.length ? <select className={styles.select} aria-label="확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => setSelectedReviewerId(event.target.value)}>{sharedReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""}</option>)}</select> : null}<button className={styles.primary} onClick={() => setTab(totalPhotos ? "progress" : "upload")}>{totalPhotos ? "고객 셀렉 보기" : "사진 올리기"}</button></div></div>
        <div className={`${styles.rawMatchToolbar} ${styles.mobileSharedRawMatchToolbar}`}><div><strong>고객 셀렉 RAW 매칭</strong><span>{rawDisabledReason || "최종 제출본 또는 현재 고른 상태를 기준으로 실행할 수 있어요."}</span></div><button className={styles.primary} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={openRawMatchDialog}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button></div>
        {data.shared?.images?.length ? <CustomerBridgeSelect
          key={`${selectedReviewer?.id ?? "project"}:${selectedSharedSelection?.id ?? "draft"}`}
          shareToken=""
          apiBase={`/api/person-select/${id}`}
          storageScope={`person-select-admin:${id}:${selectedReviewer?.id ?? "project"}`}
          gallery={{ id, title: data.event.title, total_jpg_count: data.shared.images.length, allow_resubmit: false }}
          images={data.shared.images}
          initialDraft={selectedReviewer?.draft ?? null}
          initialSelection={selectedSharedSelection}
          reviewer={selectedReviewer}
          messagesEnabled
          loadImageUrls={loadSharedImageUrls}
          qualityApi={`/api/person-select/${id}/quality`}
          canManageQuality
          adminToolbarAction={rawAction}
          adminToolbarStatus={rawStatus}
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
        <div className={styles.matchingHeader}><div><h2>검토자별 고객 셀렉</h2><p>{selectedSharedSelection ? `${selectedReviewer?.display_name ?? "검토자"}가 ${displayedSharedItems.length.toLocaleString()}장을 최종 제출했습니다.` : displayedSharedItems.length ? `${selectedReviewer?.display_name ?? "검토자"}의 서버 저장 셀렉 ${displayedSharedItems.length.toLocaleString()}장을 표시합니다. 최종 제출 전입니다.` : "검토자를 선택해 서버에 저장된 셀렉과 최종 제출 결과를 확인하세요."}</p><small className={styles.summary}>서버 기준 · 마지막 저장 {formatRelativeTime(selectedReviewer?.server_last_saved_at ?? null)}{selectedReviewer?.display_name ? ` (${selectedReviewer.display_name})` : ""}</small></div><div className={styles.actions}>{sharedReviewers.length ? <select className={styles.select} aria-label="셀렉을 확인할 검토자" value={selectedReviewer?.id ?? ""} onChange={(event) => setSelectedReviewerId(event.target.value)}>{sharedReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.display_name}{reviewer.role_label ? ` · ${reviewer.role_label}` : ""} · {reviewer.selection ? `제출 ${reviewer.selection.items.length}장` : `저장 ${reviewer.server_selected_count ?? reviewer.draft?.selected_count ?? 0}장`}</option>)}</select> : null}{selectedSharedSelection ? <span className={styles.status}>제출 완료</span> : displayedSharedItems.length ? <span className={`${styles.status} ${styles.statusIdle}`}>서버 저장됨 · 제출 전</span> : <span className={`${styles.status} ${styles.statusIdle}`}>저장된 셀렉 없음</span>}</div></div>
        {(data.shared?.deliveries?.length ?? 0) > 0 ? <div className={styles.deliverySummary}>
          <div><strong>보정본 {data.shared?.deliveries?.length ?? 0}장</strong><span> · 수정 요청 {data.shared?.deliveries?.filter((item) => item.status === "revision_requested").length ?? 0}장 · {data.event.delivery_state === "approved" ? `최종 확인 ${data.event.delivery_approved_at ? new Date(data.event.delivery_approved_at).toLocaleDateString("ko-KR") : "완료"}` : "확인 중"} · {data.event.delivery_downloaded_at ? "다운로드 완료" : "미다운로드"}</span></div>
          <div className={styles.actions}><button className={styles.weak} onClick={() => void changeDeliveryOwner("reopen")}>다시 열기</button><button className={styles.weak} disabled={!data.event.delivery_approved_at} onClick={() => void changeDeliveryOwner("extend")}>보관 연장 +30일</button></div>
        </div> : null}
        {displayedSharedMemo ? <div className={styles.notice}>전체 메모<br />{displayedSharedMemo}</div> : null}
        {displayedSharedItems.length ? <div className={styles.matchingGrid}>{displayedSharedItems.map((item) => <article className={styles.matchingCard} key={item.image_id}>{item.image?.thumb_url ? <img className={styles.matchingPhoto} src={item.image.thumb_url} alt={item.image.original_file_name} loading="lazy" /> : <div className={styles.matchingPhotoEmpty}>사진 확인 필요</div>}<div className={styles.matchingMeta}><div><strong>{item.image?.original_file_name ?? item.image_id}</strong><span>{item.customer_rating ? `${item.customer_rating}점` : item.customer_color_label ? `${item.customer_color_label}번 컬러` : "선택"}</span></div><p>{item.image?.source_rel_path ?? "상대경로 없음"}</p>{item.memo ? <small>{item.memo}</small> : null}</div></article>)}</div> : <div className={styles.matchingEmpty}><Info size={28} /><strong>서버에 저장된 셀렉이 없어요.</strong><span>고객이 셀렉하면 최종 제출 전에도 같은 사진이 여기에 표시됩니다.</span></div>}
      </section> : null}
      {tab === "progress" && !isShared ? <>
        <div className={styles.underTabs}>{filters.map(([key, label, count]) => <button key={key} className={filter === key ? styles.underTabActive : ""} onClick={() => setFilter(key)}>{label}<small>{count}</small></button>)}</div>
        <div className={styles.rawMatchToolbar}><div><strong>고객 셀렉 RAW 매칭</strong><span>{rawDisabledReason || "최종 제출본 또는 현재 고른 상태를 기준으로 실행할 수 있어요."}</span><small className={styles.summary}>서버 기준 · 마지막 저장 {formatRelativeTime(data.people.map((person) => person.server_last_saved_at ?? null).filter(Boolean).sort().at(-1) ?? null)}</small></div><button className={styles.primary} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={openRawMatchDialog}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button></div>
        {rawStatus}
        <section className={styles.panel}><div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>{personWord}</th>{data.groups.length ? <th>담임 반</th> : null}{categories.map((category) => <th key={category.key}>{categories.length === 1 ? "고른 사진" : category.label} ({category.pick}장)</th>)}<th>보정 요청</th><th>추가 주문</th><th>보정본 전달</th><th>상태</th><th>최근 활동</th><th /></tr></thead>
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
              <td className={person.order?.total ? styles.orderTotal : styles.muted} title={person.order?.lines.map((line) => `${line.label} ${line.detail} ×${line.qty}`).join("\n") ?? ""}>{person.order?.total ? formatWon(person.order.total) : "—"}</td>
              <td><div className={styles.deliveryCell}><strong>{person.delivery_count ? `${person.delivery_count}장` : "—"}</strong>{person.delivery_revision_count ? <span className={styles.deliveryRevision}>수정 요청 {person.delivery_revision_count}장</span> : person.delivery_state === "approved" ? <span>최종 확인</span> : person.delivery_count ? <span>확인 중</span> : null}{person.delivery_downloaded_at ? <small>다운로드 완료</small> : null}<div className={styles.deliveryRowActions}>{person.delivery_count ? <button type="button" onClick={(event) => { event.stopPropagation(); void changeDeliveryOwner("reopen", person.id); }}>다시 열기</button> : null}{person.delivery_approved_at ? <button type="button" onClick={(event) => { event.stopPropagation(); void changeDeliveryOwner("extend", person.id); }}>+30일</button> : null}</div></div></td>
              <td><span className={`${styles.status} ${person.status_label === "미접속" ? styles.statusIdle : person.status_label === "선택 중" ? styles.statusPending : ""}`}>{person.status_label}</span></td>
              <td className={styles.muted} title={person.latest_activity_at ? new Date(person.latest_activity_at).toLocaleString("ko-KR") : ""}>{formatRelativeTime(person.latest_activity_at)}</td>
              <td><button className={styles.detailButton} onClick={(event) => { event.stopPropagation(); setSelectedId(person.id); setDrawer(person); }}>보기</button></td>
            </tr>;
          })}</tbody>
        </table></div>{filtered.length === 0 ? <div className={styles.loading}>해당하는 사람이 없어요.</div> : null}</section>
        {filter === "delivery_revision" ? <section className={styles.deliveryRevisionPanel}><h2>수정 요청 보정본</h2><div className={styles.deliveryRevisionGrid}>{filtered.flatMap((person) => (person.deliveries ?? []).filter((item) => item.status === "revision_requested").map((item) => <article key={item.id} className={styles.deliveryRevisionCard}>{item.preview_url ? <img src={item.preview_url} alt={item.display_name} loading="lazy" /> : <div className={styles.matchingPhotoEmpty}>미리보기 없음</div>}<div><strong>{person.display_name} · {item.display_name}</strong><p>{item.customer_memo || "수정 요청 메모 없음"}</p><small>{(item.versions ?? []).map((version) => `v${version.version}${version.customer_memo_snapshot ? ` · ${version.customer_memo_snapshot}` : ""}`).join(" / ") || `v${item.current_version}`}</small></div></article>))}</div></section> : null}
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
          <div className={styles.segment} style={{ margin: "6px 0 16px" }}><button className={uploadKind === "original" ? styles.segmentActive : ""} onClick={() => setUploadKind("original")}>원본 올리기</button><button className={uploadKind === "delivery" ? styles.segmentActive : ""} onClick={() => { setUploadKind("delivery"); setSourceMode("remote"); }}>보정본 올리기</button></div>
          {uploadKind === "original" ? <>
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
          </> : <>
            <div className={styles.notice}>보정 완료 JPG/JPEG 폴더를 Mac Studio에서 선택합니다. 원본 파일은 그대로 private Storage에 보관하고, 고객 화면에는 2000px 미리보기를 사용합니다.</div>
            {workerOnline === false ? <div className={styles.warning}>Mac Studio가 꺼져 있어요. 켜진 뒤 다시 시도해 주세요.</div> : null}
            <div className={styles.selectedPath}>{path || "선택된 Mac Studio 보정본 폴더가 없습니다."}</div>
            <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} disabled={workerOnline === false || Boolean(deliveryJobId)} onClick={() => setPicker(true)}><FolderOpen size={15} />폴더 선택</button><button className={styles.primary} disabled={workerOnline !== true || !path || Boolean(deliveryJobId)} onClick={() => void startDeliveryImport()}><Upload size={15} />{deliveryJobId ? "보정본 올리는 중" : "보정본 올리기"}</button></div>
            <div className={styles.field} style={{ marginTop: 18 }}><label>경로 직접 입력</label><input className={styles.input} value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Volumes/Agentstation(M.2SSD)/.../보정본" /><small className={styles.summary}>Mac Studio에서 보이는 폴더 경로를 입력합니다. Vercel 서버를 거쳐 파일을 전송하지 않습니다.</small></div>
            {deliveryResult ? <DeliveryImportResult result={deliveryResult} people={data.people} isShared={isShared} assignments={deliveryAssignments} busy={Boolean(deliveryJobId)} onRetry={() => void startDeliveryImport()} onAssignmentChange={(deliveryId, value) => setDeliveryAssignments((current) => ({ ...current, [deliveryId]: value }))} onAssign={(deliveryId) => void assignDelivery(deliveryId)} /> : null}
          </>}
        </section>
        <aside className={styles.uploadCard}><h2>{uploadKind === "delivery" ? "보정본 연결 기준" : "가져오는 항목"}</h2>{uploadKind === "delivery" ? <><div className={styles.notice}>촬영시각 일치 → 파일명 앞 이름 → 상위 폴더 이름 순으로 고객과 연결합니다.<br />연결하지 못한 파일은 업로드 결과에서 직접 지정할 수 있습니다.</div><p className={styles.summary}>같은 파일명을 다시 올리면 새 버전으로 보관합니다. 고객이 수정 요청한 사진은 새 버전이 올라오면 “수정됨”으로 표시됩니다.</p></> : isShared ? <><div className={styles.notice}>선택한 프로젝트 폴더의 JPG를 하위 폴더까지 가져옵니다.<br />사람 계정이나 개인별 PIN은 만들지 않습니다.</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 상대경로를 보존한 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : isSchool ? <><div className={styles.notice}>선생님프로필 → 사람 이름으로 연결<br />담임선생님 → 반 단위로 등록 후 아래에서 연결</div><p className={styles.summary}>학생사진 폴더는 건너뛰고 가져오지 않습니다.<br />원본은 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : <><div className={styles.notice}>김춘자 / 이지영 … 폴더 이름 → 로그인 이름<br />각 폴더 안 JPG원본 → 그 사람만 보는 사진<br />그룹1, 그룹2 … → 고객에게 올리지 않음<br />개인1, 개인2 … → 이름을 바꾼 뒤 다시 올리기</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.<br />RAW 매칭은 각 이름 폴더 안에서 같은 파일 이름의 RAW를 찾아 촬영 폴더/Selected_RAW/이름 으로 복사합니다.</p></>}</aside>
      </div> : null}
      {tab === "settings" ? <section className={styles.panel} style={{ padding: 22 }}>
        <div className={styles.formGrid}>
          <div className={`${styles.field} ${styles.fieldFull}`}><label>프로젝트명</label><input className={styles.input} value={data.event.title} onChange={(e) => setData({ ...data, event: { ...data.event, title: e.target.value } })} /></div>
          <div className={styles.field}><label>마감일 (KST)</label><input className={styles.input} type="datetime-local" value={formatSeoulDateTimeInput(data.event.deadline_at)} onChange={(e) => setData({ ...data, event: { ...data.event, deadline_at: e.target.value } })} /></div>
          <div className={styles.field}><label>상태</label><select className={styles.select} value={data.event.status} onChange={(e) => setData({ ...data, event: { ...data.event, status: e.target.value } })}><option value="draft">준비 중 (고객 접속 안 됨)</option><option value="open">열림 (고객 선택 가능)</option><option value="closed">마감</option></select></div>
          <div className={styles.field}><label>프로젝트 유형</label><select className={styles.select} value={data.event.project_type ?? "general"} onChange={(e) => setData({ ...data, event: { ...data.event, project_type: e.target.value as PersonSelectProjectType } })}>{Object.entries(PERSON_SELECT_PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className={styles.field}><label>접근 방식</label><select className={styles.select} value={data.event.access_mode ?? "individual"} onChange={(e) => setData({ ...data, event: { ...data.event, access_mode: e.target.value as PersonSelectAccessMode } })}>{Object.entries(PERSON_SELECT_ACCESS_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small className={styles.summary}>사진만 올린 상태는 그대로 유지하며 변경할 수 있습니다. 실제 접속·선택·메모·주문·제출이 있거나 개인별 소유자/PIN이 불완전하면 정확한 이유를 안내하고 변경을 막습니다.</small></div>
          <div className={styles.field}><label>고객 화면 방식</label><select className={styles.select} value={data.event.customer_view_mode ?? "classic"} onChange={(e) => setData({ ...data, event: { ...data.event, customer_view_mode: e.target.value as PersonSelectCustomerViewMode } })}>{Object.entries(PERSON_SELECT_CUSTOMER_VIEW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className={styles.field}><label>고객 화면 단계</label><select className={styles.select} value={data.event.customer_stage ?? "select"} onChange={(event) => setData({ ...data, event: { ...data.event, customer_stage: event.target.value as "select" | "delivery" } })}><option value="select">원본 셀렉</option><option value="delivery">보정본 확인</option></select><small className={styles.summary}>보정본 확인으로 바꾸면 고객 화면에서 원본 사진과 셀렉 기록은 숨기고 보정본만 표시합니다. 원본 데이터는 삭제하지 않습니다.</small></div>
          <div className={styles.field}><label>보정본 보관 기간(일)</label><input className={styles.input} type="number" min={1} max={3650} value={data.event.delivery_retention_days ?? 30} onChange={(event) => setData({ ...data, event: { ...data.event, delivery_retention_days: Math.max(1, Number(event.target.value) || 30) } })} /><small className={styles.summary}>고객의 최종 확인일부터 계산합니다. 만료 후 원본만 삭제하고 미리보기와 기록은 유지합니다.</small></div>
          {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}><label>원본 다운로드 NAS 공유 링크</label><input className={styles.input} type="url" inputMode="url" value={data.event.nas_download_url ?? ""} onChange={(event) => setData({ ...data, event: { ...data.event, nas_download_url: event.target.value } })} placeholder="https://..." /><small className={styles.summary}>기존 공유 링크 설정은 서버에만 보관합니다. 고객에게 NAS 주소를 직접 노출하지 않고, 권한이 있는 검토자의 요청만 Mac Studio가 원본 ZIP으로 준비해 5분짜리 다운로드 링크를 발급합니다.</small></div> : null}
          {isShared ? <label className={`${styles.check} ${styles.fieldFull}`}><input type="checkbox" checked={data.event.customer_ai_results_visible === true} onChange={(event) => setData({ ...data, event: { ...data.event, customer_ai_results_visible: event.target.checked } })} /> 고객에게 AI 품질 검사 결과 공개 (검토자별 권한도 필요)</label> : null}
          <div className={`${styles.field} ${styles.fieldFull}`}><label>사진선택 항목</label><div className={styles.groupRows}>{categories.map((category, index) => <div className={styles.groupRow} key={category.key}><input className={styles.input} aria-label="항목 이름" value={category.label} onChange={(e) => setData({ ...data, event: { ...data.event, categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, label: e.target.value } : item) } })} /><select className={styles.select} value={category.pick} onChange={(e) => setData({ ...data, event: { ...data.event, categories: categories.map((item, itemIndex) => itemIndex === index ? { ...item, pick: Number(e.target.value) } : item) } })}>{Array.from({ length: 50 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}장</option>)}</select><button type="button" className={styles.weak} disabled={categories.length <= 1} aria-label={`${category.label} 삭제`} onClick={() => setData({ ...data, event: { ...data.event, categories: categories.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 size={15} /></button></div>)}</div><button type="button" className={styles.secondary} style={{ marginTop: 10 }} onClick={() => setData({ ...data, event: { ...data.event, categories: [...categories, { key: `item_${Date.now()}`, label: "새 사진 항목", pick: 1 }] } })}><Plus size={14} />항목 추가</button><small className={styles.summary}>{isShared ? "공유 프로젝트의 항목은 안내·분류에 사용하며 사람별 수량으로 해석하지 않습니다." : "올라온 사진이 수량보다 적은 사람은 있는 만큼만 고르면 됩니다."}</small></div>
          {!isShared ? <OfferSettings event={data.event} onChange={(patch) => setData({ ...data, event: { ...data.event, ...patch } })} /> : null}
          <div className={`${styles.field} ${styles.fieldFull}`}><label>고객 화면 및 접속 안내</label><div className={styles.notice}>주소: {typeof location !== "undefined" ? location.origin : ""}{publicPath}<br />{loginGuide}.<br />화면: {PERSON_SELECT_CUSTOMER_VIEW_LABELS[data.event.customer_view_mode ?? "classic"]}<br />마감: {formatSeoulDeadline(data.event.deadline_at)}</div><div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(notice)}><Clipboard size={15} />안내 문구 복사</button>{isShared ? <button className={styles.weak} onClick={() => void regenerateSharedLink()}><RefreshCw size={15} />공용 링크 재발급</button> : null}</div></div>
          {isShared ? <div className={`${styles.field} ${styles.fieldFull}`}>
            <label>검토자별 링크</label>
            <small className={styles.summary}>정연호, 클라이언트, 매니저처럼 사람마다 별도 링크를 발급합니다. 각 링크의 별점·컬러·메모·제출은 서로 섞이지 않고 대화만 함께 공유됩니다.</small>
            {finalizeReviewerCount === 0 ? <div className={styles.warning} role="alert">최종 제출할 수 있는 검토자가 없습니다. 검토자 한 명 이상에게 최종 확정 권한을 주세요.</div> : null}
            <div className={styles.reviewerCreate}><input className={styles.input} value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="검토자 이름" /><input className={styles.input} value={reviewerRole} onChange={(event) => setReviewerRole(event.target.value)} placeholder="역할 (선택)" /><button type="button" className={styles.secondary} onClick={() => void createReviewer()}><Plus size={14} />검토자 추가</button></div>
            <div className={styles.reviewerList}>{sharedReviewers.map((reviewer) => {
              const issuedToken = issuedReviewerTokens[reviewer.id];
              const issuedLink = issuedToken && typeof location !== "undefined" ? `${location.origin}/pick/shared/${issuedToken}` : "";
              return <article className={styles.reviewerRow} key={reviewer.id} data-inactive={!reviewer.active || undefined}>
                <div><strong>{reviewer.display_name}</strong><span>{reviewer.role_label || (reviewer.is_legacy ? "기존 공용 링크 호환" : "검토자")}</span><small>{reviewer.selection ? `최종 제출 ${reviewer.selection.items.length}장` : `자동 저장 ${reviewer.draft?.selected_count ?? 0}장`} · 최근 접속 {formatRelativeTime(reviewer.last_seen_at)}</small></div>
                {issuedLink ? <input className={styles.input} readOnly value={issuedLink} aria-label={`${reviewer.display_name} 발급 링크`} /> : <span className={styles.reviewerSecurity}>링크는 보안상 발급 직후에만 표시됩니다.</span>}
                <div className={styles.actions}><label className={styles.check}><input type="checkbox" checked={reviewer.can_view_ai_results === true} onChange={(event) => void setReviewerPermission(reviewer, "canViewAiResults", event.target.checked)} />AI 결과</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_jpg === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadJpg", event.target.checked)} />JPG 다운로드</label><label className={styles.check}><input type="checkbox" checked={reviewer.can_download_raw === true} onChange={(event) => void setReviewerPermission(reviewer, "canDownloadRaw", event.target.checked)} />RAW 다운로드</label><label className={styles.check}><input type="checkbox" checked={canPersonSelectReviewerFinalize(reviewer)} onChange={(event) => void setReviewerPermission(reviewer, "canFinalize", event.target.checked)} />최종 확정</label></div>
                <div className={styles.actions}>{issuedLink ? <button type="button" className={styles.secondary} onClick={() => void copyReviewerLink(reviewer.id)}><Clipboard size={14} />링크 복사</button> : null}{!reviewer.is_legacy ? <><button type="button" className={styles.weak} onClick={() => void regenerateReviewerLink(reviewer)}><RefreshCw size={14} />링크 재발급</button><button type="button" className={styles.weak} onClick={() => void setReviewerActive(reviewer, !reviewer.active)}>{reviewer.active ? "접속 중지" : "접속 허용"}</button></> : null}</div>
              </article>;
            })}</div>
          </div> : null}
        </div>
        <div className={styles.formActions}><button type="button" className={styles.danger} onClick={() => { setDeleteConfirmTitle(""); setDeleteOpen(true); }}><Trash2 size={15} />프로젝트 삭제</button><button className={styles.secondary} onClick={() => saveSettings({ title: data.event.title, deadline_at: data.event.deadline_at, status: data.event.status, categories, project_type: data.event.project_type ?? "general", access_mode: data.event.access_mode ?? "individual", customer_view_mode: data.event.customer_view_mode ?? "classic", customer_stage: data.event.customer_stage ?? "select", delivery_retention_days: data.event.delivery_retention_days ?? 30, nas_download_url: data.event.nas_download_url ?? null, customer_ai_results_visible: data.event.customer_ai_results_visible === true, offer_notice: data.event.offer_notice ?? "", extra_price: data.event.extra_price ?? 0, extra_max: data.event.extra_max ?? 0, offers: data.event.offers ?? [] })}>설정 저장</button></div>
      </section> : null}
    </section>
    {rawDialogOpen ? <RawMatchDialog
      mode={rawMode}
      onModeChange={setRawMode}
      source={rawSource}
      onSourceChange={(source) => { rawSourceSavedRef.current = true; setRawSource(source); }}
      labelNames={rawLabelNames}
      onLabelNamesChange={setRawLabelNames}
      isShared={isShared}
      reviewerScope={rawReviewerScope}
      onReviewerScopeChange={setRawReviewerScope}
      reviewers={sharedReviewers.filter((reviewer) => reviewer.active)}
      selectedCount={rawPreview.targets.length}
      submittedCount={rawPreview.submittedSelectedCount}
      currentCount={rawPreview.currentUnsubmittedCount}
      pathPlan={rawPathPlan}
      busy={rawBusy}
      disabledReason={!rawPreview.targets.length ? "선택한 기준에 고른 사진이 없어요." : rawDisabledReason}
      onClose={() => setRawDialogOpen(false)}
      onRun={() => void startRawMatch()}
    /> : null}
    {picker ? <PhotoSourcePicker targetWorker="jake-macstudio-01" sourceScope="person-select" onCancel={() => setPicker(false)} onSelectRemote={(selection) => { setPath(selection.path); setPicker(false); }} /> : null}
    {pinListOpen ? <PinListDialog eventId={id} onClose={() => setPinListOpen(false)} onUpdated={load} /> : null}
    {syncDialogOpen ? <SelectionSyncDialog eventTitle={data.event.title} reviewers={data.shared?.reviewers ?? []} people={data.people} recentFailureCount={data.sync?.recent_failure_count ?? 0} recentFailures={data.sync?.recent_failures ?? []} onClose={() => setSyncDialogOpen(false)} onRefresh={() => void load()} /> : null}
    {deleteOpen ? <div className={styles.modalBackdrop} onClick={() => { if (!deleting) setDeleteOpen(false); }}>
      <section className={`${styles.pinDialog} ${styles.deleteDialog}`} role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalTop}><div><p className={styles.eyebrow}>되돌릴 수 없는 작업</p><h2 id="delete-project-title">프로젝트 삭제</h2><p>사진, 참가자, 선택·주문·제출 기록과 업로드한 미리보기 파일을 함께 삭제합니다.</p></div><button type="button" className={styles.weak} aria-label="닫기" disabled={deleting} onClick={() => setDeleteOpen(false)}><X size={20} /></button></div>
        <div className={styles.warning} role="alert">삭제하려면 프로젝트명 <strong>{currentData.event.title}</strong>을 아래에 정확히 입력해 주세요. 업로드 중인 프로젝트는 삭제할 수 없습니다.</div>
        <div className={styles.field}><label htmlFor="delete-project-confirm">프로젝트명 확인</label><input id="delete-project-confirm" className={styles.input} autoFocus value={deleteConfirmTitle} disabled={deleting} onChange={(event) => setDeleteConfirmTitle(event.target.value)} autoComplete="off" /></div>
        <div className={styles.modalActions}><button type="button" className={styles.secondary} disabled={deleting} onClick={() => setDeleteOpen(false)}>취소</button><button type="button" className={styles.dangerSolid} disabled={deleting || deleteConfirmTitle.trim() !== currentData.event.title} onClick={() => void deleteProject()}>{deleting ? "삭제 중" : "영구 삭제"}</button></div>
      </section>
    </div> : null}
    {drawer ? <PersonDetailDrawer person={data.people.find((person) => person.id === drawer.id) ?? drawer} personWord={isSchool ? "선생님" : ""} eventId={id} labels={labels} categoryLabels={categoryLabels} options={data.event.retouch_options} onClose={() => setDrawer(null)} onSaved={load} onPin={async () => {
      try {
        const response = await fetch(`/api/person-select/${id}/people/${drawer.id}/pin`, { method: "POST" });
        const body = await readApiResponse<{ pin?: string }>(response, "비밀번호 재발급");
        setError(`${drawer.display_name} 새 비밀번호: ${body.pin ?? "확인 필요"}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "비밀번호를 재발급하지 못했습니다.");
      }
    }} /> : null}
  </main>;
}
