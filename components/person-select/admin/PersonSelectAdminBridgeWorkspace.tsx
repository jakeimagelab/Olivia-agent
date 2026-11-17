"use client";

import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock3,
  Clipboard,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  ListOrdered,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Star,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import {
  PERSON_SELECT_ADMIN_STATUS_LABELS,
  compactPersonSelectFilename,
  pairSelectedImagesWithDeliveries,
  resolvePersonSelectAdminStatus,
  togglePersonSelectRetouchKey,
  type PersonSelectAdminStatus,
} from "@/lib/person-select/adminWorkspace";
import type {
  PersonSelectAdminData,
  PersonSelectAdminImage,
  PersonSelectSharedSelectionItem,
} from "@/lib/person-select/adminData";
import type { PersonSelectAdminChoice, PersonSelectAdminDeliveryItem, PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import { formatRelativeTime, formatWon } from "@/lib/person-select/format";
import { formatSeoulDeadlineCompact } from "@/lib/person-select/date";
import {
  BRIDGE_COLOR_LABELS,
  EMPTY_BRIDGE_LABEL_FILTERS,
  bridgeLabelFilterName,
  matchesBridgeFilenameSearch,
  matchesBridgeLabelFilters,
  updateBridgeLabelFilters,
  type BridgeLabelFilterCommand,
  type BridgeLabelFilters,
  type BridgeColorLabels,
} from "@/lib/photo-bridge/labels";
import { useBridgeSearchFilterShortcuts } from "@/lib/photo-bridge/useBridgeSearchFilterShortcuts";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import bridgeStyles from "@/components/olivia-bridge/OliviaBridgeWorkspace.module.css";
import styles from "./PersonSelectAdminBridgeWorkspace.module.css";

type TreeFilter = "all" | "retouch" | "revision" | "unsubmitted";
type NodeKind = "all" | "selected" | "deliveries" | "group";
type SelectedNode = { ownerId: string; kind: NodeKind; groupLabel?: string };

type WorkspacePhoto = PersonSelectAdminImage & {
  thumbnail_url?: string;
  choice?: PersonSelectAdminChoice | PersonSelectSharedSelectionItem | null;
  selectedOrder?: number | null;
};

const STATUS_COLORS: Record<PersonSelectAdminStatus, string> = {
  selecting: "#8E9A98",
  submitted: "#4B82C3",
  retouch_pending: "#D97A2B",
  approval_pending: "#D2A72C",
  revision_requested: "#D54D43",
  approved: "#4C9A5C",
};

const MEDIA_BATCH_SIZE = 72;
const MIN_THUMBNAIL_SIZE = 104;
const MAX_THUMBNAIL_SIZE = 224;
const THUMBNAIL_STEP = 12;

export function PersonSelectAdminBridgeWorkspace({
  eventId,
  data,
  selectedPersonId,
  selectedReviewerId,
  rawBusy,
  rawDisabled,
  rawDisabledReason,
  rawStatus,
  uploadPanel,
  settingsPanel,
  loadImages,
  loadImageUrls,
  onPersonSelect,
  onReviewerSelect,
  onRawOpen,
  onReload,
  onMessage,
  onOpenPinList,
  onOpenSync,
  onCopyNotice,
  onDeliveryAction,
  onDeliveryDrop,
  onOffersOpenChange,
  onBack,
  initialModal,
}: {
  eventId: string;
  data: PersonSelectAdminData;
  selectedPersonId: string | null;
  selectedReviewerId: string | null;
  rawBusy: boolean;
  rawDisabled: boolean;
  rawDisabledReason: string;
  rawStatus: ReactNode;
  uploadPanel: ReactNode;
  settingsPanel: ReactNode;
  loadImages: (scope: { kind: "all" | "person" | "group"; ownerId?: string; groupLabel?: string }) => Promise<PersonSelectAdminImage[]>;
  loadImageUrls: (imageIds: string[], options?: { variant: SelectionMediaVariant }) => Promise<Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>>;
  onPersonSelect: (personId: string) => void;
  onReviewerSelect: (reviewerId: string) => void;
  onRawOpen: (mode: "copy" | "mark") => void;
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
  onOpenPinList: () => void;
  onOpenSync: () => void;
  onCopyNotice: () => void;
  onDeliveryAction: (action: "reopen" | "extend", personId?: string) => void | Promise<void>;
  onDeliveryDrop: (fileNames: string[], linkedImageId?: string) => void | Promise<void>;
  onOffersOpenChange: (open: boolean) => void | Promise<void>;
  onBack: () => void;
  initialModal?: "upload" | "settings" | null;
}) {
  const isShared = data.event.access_mode === "project_shared";
  const reviewers = useMemo(() => data.shared?.reviewers ?? [], [data.shared?.reviewers]);
  const selectedReviewer = reviewers.find((reviewer) => reviewer.id === selectedReviewerId) ?? reviewers[0] ?? null;
  const [treeFilter, setTreeFilter] = useState<TreeFilter>("all");
  const [treeQuery, setTreeQuery] = useState("");
  const defaultOwnerId = isShared ? selectedReviewer?.id ?? "shared" : selectedPersonId ?? data.people[0]?.id ?? "";
  const [expandedOwnerId, setExpandedOwnerId] = useState<string | null>(() => defaultOwnerId || null);
  const [node, setNode] = useState<SelectedNode>(() => ({ ownerId: defaultOwnerId, kind: "all" }));
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [labelFilters, setLabelFilters] = useState<BridgeLabelFilters>(() => ({ ...EMPTY_BRIDGE_LABEL_FILTERS }));
  const [scopedImages, setScopedImages] = useState<PersonSelectAdminImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState("");
  const [imageUrls, setImageUrls] = useState<Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>>({});
  const [visibleLimit, setVisibleLimit] = useState(96);
  const [thumbnailSize, setThumbnailSize] = useState(140);
  const [sortMode, setSortMode] = useState<"filename" | "capture">("capture");
  const [inspectorTab, setInspectorTab] = useState<"customer" | "preview">("customer");
  const [modal, setModal] = useState<"upload" | "settings" | null>(initialModal ?? null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialModal) setModal(initialModal);
  }, [initialModal]);

  useEffect(() => {
    const nextOwner = isShared ? selectedReviewer?.id ?? "shared" : selectedPersonId ?? data.people[0]?.id ?? "";
    if (!nextOwner) return;
    setNode((current) => current.ownerId === nextOwner ? current : { ownerId: nextOwner, kind: "all" });
    setExpandedOwnerId(nextOwner);
  }, [data.people, isShared, selectedPersonId, selectedReviewer?.id]);

  const statusForPerson = useCallback((person: PersonSelectAdminPerson) => resolvePersonSelectAdminStatus({
    submittedAt: person.submitted_at,
    rawMatched: Boolean(data.event.raw_matched_at),
    deliveryState: person.delivery_state,
    deliveries: person.deliveries,
  }), [data.event.raw_matched_at]);

  const filteredPeople = useMemo(() => data.people.filter((person) => {
    const status = statusForPerson(person);
    if (treeQuery && !person.display_name.normalize("NFC").toLocaleLowerCase("ko-KR").includes(treeQuery.normalize("NFC").toLocaleLowerCase("ko-KR"))) return false;
    if (treeFilter === "retouch") return status === "retouch_pending";
    if (treeFilter === "revision") return status === "revision_requested";
    if (treeFilter === "unsubmitted") return !person.submitted_at;
    return true;
  }), [data.people, statusForPerson, treeFilter, treeQuery]);

  const activePerson = !isShared ? data.people.find((person) => person.id === node.ownerId) ?? data.people[0] ?? null : null;
  const sharedItems = useMemo(() => selectedReviewer?.selection?.items ?? selectedReviewer?.draft?.items ?? [], [selectedReviewer]);
  const imageScope = useMemo<{ kind: "all" | "person" | "group"; ownerId?: string; groupLabel?: string }>(() => {
    if (node.kind === "group") return { kind: "group" as const, groupLabel: node.groupLabel ?? "" };
    if (isShared) return { kind: "all" as const };
    return { kind: "person" as const, ownerId: activePerson?.id ?? "" };
  }, [activePerson?.id, isShared, node.groupLabel, node.kind]);
  useEffect(() => {
    if (node.kind === "selected" || node.kind === "deliveries" || (imageScope.kind === "person" && !imageScope.ownerId)) return;
    let active = true;
    setScopedImages([]);
    setImagesLoading(true);
    setImagesError("");
    void loadImages(imageScope)
      .then((images) => { if (active) setScopedImages(images); })
      .catch((error) => { if (active) { setScopedImages([]); setImagesError(error instanceof Error ? error.message : "사진 목록을 불러오지 못했습니다."); } })
      .finally(() => { if (active) setImagesLoading(false); });
    return () => { active = false; };
  }, [imageScope, loadImages, node.kind]);
  const allImages = scopedImages;
  const imageById = useMemo(() => new Map(allImages.map((image) => [image.id, image])), [allImages]);

  const selectedChoices = useMemo(() => {
    if (isShared) return sharedItems;
    return activePerson?.choices ?? [];
  }, [activePerson?.choices, isShared, sharedItems]);
  const selectedIds = useMemo(() => new Set(selectedChoices.map((choice) => "image_id" in choice ? choice.image_id : "")), [selectedChoices]);
  const selectedOrder = useMemo(() => new Map(selectedChoices.map((choice, index) => [("image_id" in choice ? choice.image_id : ""), index + 1])), [selectedChoices]);
  const choiceByImageId = useMemo(() => new Map(selectedChoices.map((choice) => [choice.image_id, choice])), [selectedChoices]);
  const ratings = useMemo(() => Object.fromEntries(selectedChoices.map((choice) => {
    const rating = "customer_rating" in choice ? choice.customer_rating : null;
    return [choice.image_id, rating || 5];
  })), [selectedChoices]);
  const colors = useMemo<BridgeColorLabels>(() => Object.fromEntries(selectedChoices.flatMap((choice) => {
    const color = "customer_color_label" in choice ? choice.customer_color_label : null;
    return color ? [[choice.image_id, color]] : [];
  })) as BridgeColorLabels, [selectedChoices]);

  const ownerImages = allImages;

  const selectedPhotos = useMemo<WorkspacePhoto[]>(() => selectedChoices.flatMap((choice): WorkspacePhoto[] => {
    const imageId = choice.image_id;
    const base = imageById.get(imageId);
    if (base) return [{ ...base, thumbnail_url: undefined, choice, selectedOrder: selectedOrder.get(imageId) ?? null }];
    const linked = "person_select_images" in choice ? choice.person_select_images : choice.image;
    if (!linked) return [];
    return [{
      id: imageId,
      owner_person_id: activePerson?.id ?? null,
      owner_group: activePerson?.group_label ?? null,
      category_key: "category_key" in choice ? choice.category_key : "photo",
      original_file_name: linked.original_file_name,
      source_rel_path: linked.source_rel_path,
      sort_order: selectedOrder.get(imageId) ?? 0,
      thumbnail_url: linked.thumb_url,
      choice,
      selectedOrder: selectedOrder.get(imageId) ?? null,
    }];
  }), [activePerson, imageById, selectedChoices, selectedOrder]);

  const deliveries = useMemo(
    () => isShared ? data.shared?.deliveries ?? [] : activePerson?.deliveries ?? [],
    [activePerson?.deliveries, data.shared?.deliveries, isShared],
  );
  const deliveryPairs = useMemo(() => pairSelectedImagesWithDeliveries(selectedPhotos, deliveries), [deliveries, selectedPhotos]);
  const basePhotos = useMemo<WorkspacePhoto[]>(() => node.kind === "selected"
    ? selectedPhotos
    : ownerImages.map((image) => ({ ...image, choice: choiceByImageId.get(image.id) ?? null, selectedOrder: selectedOrder.get(image.id) ?? null })),
  [choiceByImageId, node.kind, ownerImages, selectedOrder, selectedPhotos]);
  const filteredPhotos = useMemo(() => basePhotos.filter((photo) => {
    if (!matchesBridgeFilenameSearch(photo.original_file_name, searchQuery)) return false;
    return matchesBridgeLabelFilters(photo.id, labelFilters, ratings, colors);
  }).sort((left, right) => sortMode === "filename"
    ? left.original_file_name.localeCompare(right.original_file_name, "ko-KR", { numeric: true, sensitivity: "base" })
    : left.sort_order - right.sort_order || left.id.localeCompare(right.id)), [basePhotos, colors, labelFilters, ratings, searchQuery, sortMode]);
  const visiblePhotos = useMemo(() => filteredPhotos.slice(0, visibleLimit), [filteredPhotos, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(96);
    setSelectedPhotoId(null);
  }, [node.kind, node.ownerId, node.groupLabel, searchQuery, labelFilters.color, labelFilters.rating]);

  useEffect(() => {
    if (node.kind === "deliveries") return;
    const missing = visiblePhotos.map((photo) => photo.id).filter((id) => !imageUrls[id]);
    if (!missing.length) return;
    let active = true;
    void (async () => {
      for (let offset = 0; offset < missing.length; offset += MEDIA_BATCH_SIZE) {
        const urls = await loadImageUrls(missing.slice(offset, offset + MEDIA_BATCH_SIZE), { variant: "thumbnail" });
        if (!active) return;
        setImageUrls((current) => ({ ...current, ...urls }));
      }
    })().catch((error) => { if (active) onMessage(error instanceof Error ? error.message : "사진 주소를 불러오지 못했습니다."); });
    return () => { active = false; };
  }, [imageUrls, loadImageUrls, node.kind, onMessage, visiblePhotos]);

  useEffect(() => {
    if (!selectedPhotoId || imageUrls[selectedPhotoId]?.image_url) return;
    let active = true;
    void loadImageUrls([selectedPhotoId], { variant: "preview" })
      .then((urls) => { if (active) setImageUrls((current) => ({ ...current, ...urls })); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [imageUrls, loadImageUrls, selectedPhotoId]);

  const applyFilterCommand = useCallback((command: BridgeLabelFilterCommand) => {
    setLabelFilters((current) => updateBridgeLabelFilters(current, command));
  }, []);
  const handleSearchFilterShortcut = useBridgeSearchFilterShortcuts({
    searchInputRef,
    searchQuery,
    onSearchQueryChange: setSearchQuery,
    onFilterCommand: applyFilterCommand,
  });

  const ownerIds = useMemo(
    () => isShared ? reviewers.map((reviewer) => reviewer.id) : filteredPeople.map((person) => person.id),
    [filteredPeople, isShared, reviewers],
  );
  const selectOwner = useCallback((ownerId: string) => {
    setNode({ ownerId, kind: "all" });
    setExpandedOwnerId(ownerId);
    setInspectorTab("customer");
    if (isShared) onReviewerSelect(ownerId);
    else onPersonSelect(ownerId);
  }, [isShared, onPersonSelect, onReviewerSelect]);
  const handleKeyboard = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (handleSearchFilterShortcut(event.nativeEvent)) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return;
    if ((event.metaKey || event.ctrlKey) && ["Equal", "NumpadAdd", "Minus", "NumpadSubtract"].includes(event.code)) {
      event.preventDefault();
      const delta = event.code === "Equal" || event.code === "NumpadAdd" ? THUMBNAIL_STEP : -THUMBNAIL_STEP;
      setThumbnailSize((current) => Math.min(MAX_THUMBNAIL_SIZE, Math.max(MIN_THUMBNAIL_SIZE, current + delta)));
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const index = ownerIds.indexOf(node.ownerId);
    if (index < 0 || !ownerIds.length) return;
    event.preventDefault();
    const nextIndex = event.key === "ArrowDown" ? Math.min(ownerIds.length - 1, index + 1) : Math.max(0, index - 1);
    selectOwner(ownerIds[nextIndex]);
  }, [handleSearchFilterShortcut, node.ownerId, ownerIds, selectOwner]);

  function selectNode(ownerId: string, kind: NodeKind, groupLabel?: string) {
    setNode({ ownerId, kind, groupLabel });
    if (kind !== "group") setExpandedOwnerId(ownerId);
    if (kind !== "group") {
      if (isShared) onReviewerSelect(ownerId);
      else onPersonSelect(ownerId);
    }
  }

  function toggleExpanded(ownerId: string) {
    setExpandedOwnerId((current) => current === ownerId ? null : ownerId);
  }

  const selectedPhoto = [...basePhotos, ...selectedPhotos].find((photo) => photo.id === selectedPhotoId) ?? null;
  const selectedChoice = selectedChoices.find((choice) => choice.image_id === selectedPhotoId) ?? null;
  const selectedDelivery = deliveries.find((delivery) => delivery.linked_image_id === selectedPhotoId) ?? null;
  const previewPhoto = [...basePhotos, ...selectedPhotos].find((photo) => photo.id === previewPhotoId) ?? null;

  async function deleteDelivery(delivery: PersonSelectAdminDeliveryItem) {
    if (!window.confirm(`${delivery.display_name} 보정본을 삭제할까요?\n모든 버전과 업로드 파일이 삭제됩니다.`)) return;
    const response = await fetch(`/api/person-select/${eventId}/deliveries/${delivery.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(body.error || "보정본을 삭제하지 못했습니다.");
    await onReload();
    onMessage(`${delivery.display_name} 보정본을 삭제했습니다.`);
  }

  function droppedFileNames(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    return [...event.dataTransfer.files].map((file) => file.name).filter(Boolean);
  }

  const statusCounts = data.people.reduce<Record<PersonSelectAdminStatus, number>>((counts, person) => {
    const status = statusForPerson(person);
    counts[status] += 1;
    return counts;
  }, { selecting: 0, submitted: 0, retouch_pending: 0, approval_pending: 0, revision_requested: 0, approved: 0 });
  const treeFilterCounts: Record<TreeFilter, number> = {
    all: data.people.length,
    retouch: statusCounts.retouch_pending,
    revision: statusCounts.revision_requested,
    unsubmitted: data.people.filter((person) => !person.submitted_at).length,
  };
  const browserTitle = node.kind === "selected" ? "선택분" : node.kind === "deliveries" ? "보정본" : node.kind === "group" ? node.groupLabel : activePerson?.display_name ?? selectedReviewer?.display_name ?? "사진";
  const totalOwners = data.people.length || reviewers.length;
  const submittedOwnerCount = isShared
    ? reviewers.filter((reviewer) => Boolean(reviewer.selection?.submitted_at)).length
    : data.people.filter((person) => Boolean(person.submitted_at)).length;

  return <section className={`${bridgeStyles.bridge} ${styles.workspace}`} data-desktop-ui="true" tabIndex={-1} onKeyDown={handleKeyboard}>
    <header className={`${bridgeStyles.bridgeBar} ${styles.topBar}`}>
      <button className={styles.backButton} aria-label="사진선택으로 돌아가기" onClick={onBack}><ArrowLeft size={17} /></button>
      <div className={styles.projectSummary}><strong>{data.event.title}</strong><span>{data.event.categories.map((category) => category.label).join(" · ") || "고객 사진"} · {totalOwners}명 · 마감 {formatSeoulDeadlineCompact(data.event.deadline_at)}</span></div>
      <div className={styles.topControls}>
        <label className={`${bridgeStyles.filenameSearch} ${styles.searchWrap}`}><Search size={14} /><input ref={searchInputRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="파일명 검색" aria-label="파일명 검색" />{searchQuery ? <button type="button" aria-label="검색 지우기" onClick={() => setSearchQuery("")}><X size={13} /></button> : <kbd>⌘F</kbd>}</label>
        <select aria-label="별점 필터" value={labelFilters.rating ?? ""} onChange={(event) => applyFilterCommand(event.target.value ? { kind: "rating", rating: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 } : { kind: "all" })}><option value="">별점</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>★{rating} 이상</option>)}</select>
        <select aria-label="컬러 필터" value={labelFilters.color ?? ""} onChange={(event) => applyFilterCommand(event.target.value ? { kind: "color", label: Number(event.target.value) as 6 | 7 | 8 | 9 } : { kind: "all" })}><option value="">컬러</option>{([6, 7, 8, 9] as const).map((label) => <option key={label} value={label}>{label} · {BRIDGE_COLOR_LABELS[label].name}</option>)}</select>
        {labelFilters.rating ? <button className={styles.filterChip} onClick={() => applyFilterCommand({ kind: "rating", rating: labelFilters.rating! })}>{bridgeLabelFilterName({ kind: "rating", rating: labelFilters.rating })}<X size={12} /></button> : null}
        {labelFilters.color ? <button className={styles.filterChip} onClick={() => applyFilterCommand({ kind: "color", label: labelFilters.color! })}>{bridgeLabelFilterName({ kind: "color", label: labelFilters.color })}<X size={12} /></button> : null}
      </div>
    </header>

    <main className={`${bridgeStyles.workspace} ${styles.panes}`}>
      <aside className={`${bridgeStyles.folderPanel} ${styles.treePane}`}>
        <div className={bridgeStyles.panelTitle}><strong>{isShared ? "검토자" : "고객"}</strong><span>{isShared ? reviewers.length : data.people.length}</span></div>
        <div className={styles.treeControls}>
          <label className={styles.treeSearch}><Search size={13} /><input value={treeQuery} onChange={(event) => setTreeQuery(event.target.value)} placeholder="고객 검색" /></label>
          {!isShared ? <div className={styles.treeFilters}>{([ ["all", "전체"], ["retouch", "보정 대기"], ["revision", "수정 요청"], ["unsubmitted", "미제출"] ] as const).map(([key, label]) => <button key={key} className={treeFilter === key ? styles.treeFilterActive : ""} onClick={() => setTreeFilter(key)}>{label} <b>{treeFilterCounts[key]}</b></button>)}</div> : null}
        </div>
        <div className={`${bridgeStyles.folderPanelScroll} ${styles.treeScroll}`}><div className={`${bridgeStyles.folderList} ${styles.ownerList}`}>
          {(isShared ? reviewers : filteredPeople).map((owner) => {
            const ownerId = owner.id;
            const person = !isShared ? owner as PersonSelectAdminPerson : null;
            const reviewer = isShared ? owner as typeof reviewers[number] : null;
            const ownerChoices = person?.choices ?? reviewer?.selection?.items ?? reviewer?.draft?.items ?? [];
            const ownerDeliveries = person?.deliveries ?? data.shared?.deliveries ?? [];
            const status = person ? statusForPerson(person) : resolvePersonSelectAdminStatus({ submittedAt: reviewer?.selection?.submitted_at, rawMatched: Boolean(data.event.raw_matched_at), deliveryState: data.event.delivery_state, deliveries: ownerDeliveries });
            const open = expandedOwnerId === ownerId;
            return <div className={styles.treeOwner} key={ownerId}>
              <div className={node.ownerId === ownerId && node.kind === "all" ? styles.treeRowActive : styles.treeRow}>
                <button className={styles.disclosure} aria-label={open ? "접기" : "펼치기"} onClick={() => toggleExpanded(ownerId)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
                <button className={styles.ownerButton} onClick={() => selectOwner(ownerId)}><span className={styles.statusDot} style={{ background: STATUS_COLORS[status] }} /><strong>{person?.display_name ?? reviewer?.display_name}</strong><small>{PERSON_SELECT_ADMIN_STATUS_LABELS[status]}</small><b>{ownerDeliveries.length}/{ownerChoices.length}</b></button>
              </div>
              {open ? <div className={styles.virtualFolders}><button className={node.ownerId === ownerId && node.kind === "selected" ? styles.virtualActive : ""} onClick={() => selectNode(ownerId, "selected")}><Folder size={14} /><span>선택분</span><b>{ownerChoices.length}</b></button><button className={node.ownerId === ownerId && node.kind === "deliveries" ? styles.virtualActive : ""} onClick={() => selectNode(ownerId, "deliveries")}><PackageCheck size={14} /><span>보정본</span><b>{ownerDeliveries.length}</b></button></div> : null}
            </div>;
          })}
        </div></div>
        {data.groups.length ? <div className={styles.groupSection}><strong>그룹사진</strong>{data.groups.map((group) => <button key={group.label} className={node.kind === "group" && node.groupLabel === group.label ? styles.virtualActive : ""} onClick={() => selectNode(`group:${group.label}`, "group", group.label)}><FolderOpen size={14} /><span>{group.label}</span><b>{group.image_count}</b></button>)}</div> : <div />}
        <label className={bridgeStyles.folderThumbnailGauge}><span>썸네일 크기</span><input type="range" min={MIN_THUMBNAIL_SIZE} max={MAX_THUMBNAIL_SIZE} step={THUMBNAIL_STEP} value={thumbnailSize} onChange={(event) => setThumbnailSize(Number(event.target.value))} /><small>⌘− / ⌘+</small></label>
      </aside>
      <span className={bridgeStyles.paneDivider} aria-hidden="true" />

      <section className={`${bridgeStyles.browserPanel} ${styles.gridPane}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { const names = droppedFileNames(event); if (names.length) void onDeliveryDrop(names); }}>
        <header className={bridgeStyles.browserHeader}><div className={bridgeStyles.browserTitle}><strong>{browserTitle}</strong><span>{node.kind === "deliveries" ? `${deliveryPairs.slots.length}개 슬롯` : searchQuery ? `검색 ${filteredPhotos.length.toLocaleString()}장` : `${filteredPhotos.length.toLocaleString()}장`}</span></div><div className={`${bridgeStyles.thumbnailControls} ${styles.sortControls}`}><button aria-label="파일명 순서" title="파일명 순서" aria-pressed={sortMode === "filename"} onClick={() => setSortMode("filename")}><ListOrdered size={15} /></button><button aria-label="촬영 순서" title="촬영 순서" aria-pressed={sortMode === "capture"} onClick={() => setSortMode("capture")}><Clock3 size={15} /></button></div></header>
        <div className={`${bridgeStyles.fileArea} ${styles.fileArea}`}>
          {rawStatus ? <div className={styles.rawStatus}>{rawStatus}</div> : null}
          {node.kind === "deliveries" ? <div className={styles.deliveryGrid}>{deliveryPairs.slots.map(({ image, delivery }) => {
            const thumb = image.thumbnail_url || imageUrls[image.id]?.thumbnail_url;
            return <article key={image.id} className={`${styles.deliverySlot} ${selectedPhotoId === image.id ? styles.photoSelected : ""}`} onClick={() => { setSelectedPhotoId(image.id); setInspectorTab("preview"); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); const names = droppedFileNames(event); if (names.length) void onDeliveryDrop(names, image.id); }}>
              <div className={styles.compareThumb}>{thumb ? <img src={thumb} alt={image.original_file_name} /> : <span><ImageIcon /></span>}{delivery?.preview_url ? <img src={delivery.preview_url} alt={delivery.display_name} /> : <div className={styles.waitingSlot}><Upload size={20} /><b>업로드 대기</b><small>여기에 놓기</small></div>}</div>
              <strong title={image.original_file_name}>{compactPersonSelectFilename(image.original_file_name)}</strong>{delivery ? <p>v{delivery.current_version} · {delivery.status === "revision_requested" ? "수정 요청" : delivery.status === "approved" ? "확정" : delivery.status === "revised" ? "수정됨" : "확인 대기"}</p> : <p>선택 원본에 연결된 보정본 없음</p>}
            </article>;
          })}{deliveryPairs.unlinked.map((delivery) => <article key={delivery.id} className={styles.unlinkedDelivery}><div>{delivery.preview_url ? <img src={delivery.preview_url} alt={delivery.display_name} /> : <ImageIcon />}</div><strong>{delivery.display_name}</strong><p>연결 안 됨 · 수동 지정 필요</p></article>)}</div> : <>
            <div className={`${bridgeStyles.thumbnailGrid} ${styles.photoGrid}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, ${thumbnailSize}px))` }}>{visiblePhotos.map((photo) => {
              const thumb = photo.thumbnail_url || imageUrls[photo.id]?.thumbnail_url;
              return <button key={photo.id} title={photo.original_file_name} className={`${bridgeStyles.thumbnailCard} ${styles.photoCard} ${selectedIds.has(photo.id) ? bridgeStyles.manualSelected : ""} ${selectedPhotoId === photo.id ? bridgeStyles.focused : ""}`} onClick={() => { setSelectedPhotoId(photo.id); setInspectorTab("preview"); }} onDoubleClick={() => setPreviewPhotoId(photo.id)}>
                <span className={`${bridgeStyles.thumbnailMedia} ${styles.photoFrame}`}>{thumb ? <img src={thumb} alt={photo.original_file_name} loading="lazy" /> : <span className={styles.photoPlaceholder}><ImageIcon /></span>}{photo.selectedOrder ? <b className={styles.selectionOrder}>{photo.selectedOrder}</b> : null}{ratings[photo.id] ? <span className={bridgeStyles.rating}>★{ratings[photo.id]}</span> : null}{colors[photo.id] ? <span className={bridgeStyles.colorLabelMark} style={{ background: BRIDGE_COLOR_LABELS[colors[photo.id] as 6 | 7 | 8 | 9].color }} /> : null}</span>
                <span className={bridgeStyles.photoName}>{compactPersonSelectFilename(photo.original_file_name)}</span>
              </button>;
            })}</div>
            {visibleLimit < filteredPhotos.length ? <button className={styles.loadMore} onClick={() => setVisibleLimit((count) => count + 96)}>더 보기 · {Math.min(96, filteredPhotos.length - visibleLimit)}장</button> : null}
            {!filteredPhotos.length && !imagesLoading && !imagesError ? <div className={styles.empty}><ImageIcon /><strong>조건에 맞는 사진이 없어요.</strong><span>검색어나 필터를 지워 보세요.</span></div> : null}
            {imagesLoading ? <div className={styles.empty}><ImageIcon /><strong>사진 목록을 불러오고 있어요.</strong></div> : null}
            {imagesError ? <div className={styles.empty}><ImageIcon /><strong>{imagesError}</strong><span>고객을 다시 선택해 주세요.</span></div> : null}
          </>}
        </div>
      </section>
      <span className={bridgeStyles.paneDivider} aria-hidden="true" />

      <aside className={`${bridgeStyles.previewPanel} ${styles.inspector}`}>
        <header className={bridgeStyles.previewHeader}><strong>선택 정보</strong><UserRound size={16} /></header>
        <div className={bridgeStyles.previewTabs} role="tablist"><button role="tab" aria-selected={inspectorTab === "customer"} onClick={() => setInspectorTab("customer")}>고객</button><button role="tab" aria-selected={inspectorTab === "preview"} onClick={() => setInspectorTab("preview")}>미리보기</button></div>
        <div className={styles.inspectorScroll}>{inspectorTab === "customer"
          ? activePerson ? <PersonInspector person={activePerson} eventSlug={data.event.slug} rawMatchedAt={data.event.raw_matched_at} onOpenPinList={onOpenPinList} onDeliveryAction={onDeliveryAction} /> : selectedReviewer ? <SharedInspector reviewer={selectedReviewer} deliveryCount={deliveries.length} orderOpen={data.event.offers_open === true} /> : <div className={styles.emptyInspector}><UserRound /><span>고객을 선택하세요.</span></div>
          : selectedPhoto ? <><div className={styles.previewCanvas}>{imageUrls[selectedPhoto.id]?.image_url || imageUrls[selectedPhoto.id]?.thumbnail_url || selectedPhoto.thumbnail_url ? <img src={imageUrls[selectedPhoto.id]?.image_url || imageUrls[selectedPhoto.id]?.thumbnail_url || selectedPhoto.thumbnail_url} alt={selectedPhoto.original_file_name} /> : <ImageIcon />}</div><PhotoInspector eventId={eventId} photo={selectedPhoto} choice={selectedChoice} delivery={selectedDelivery} labels={data.event.retouch_options} onDeleteDelivery={deleteDelivery} onReload={onReload} onMessage={onMessage} /></> : <div className={styles.emptyInspector}><ImageIcon /><span>사진을 선택하면 크게 볼 수 있어요.</span></div>}
        </div>
      </aside>
    </main>

    <section className={`${bridgeStyles.actionBar} ${styles.actionBar}`}>
      <div className={bridgeStyles.actionSummary}><span>고객 <b>{totalOwners}</b></span><span>제출 <b>{submittedOwnerCount}</b></span><span>보정 대기 <b>{statusCounts.retouch_pending}</b></span><span>수정 요청 <b>{statusCounts.revision_requested}</b></span><span>확정 <b>{statusCounts.approved}</b></span></div>
      <div className={`${bridgeStyles.actionTools} ${styles.actionTools}`}>
        <button disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭"} onClick={() => onRawOpen("copy")}><Link2 size={13} />{rawBusy ? "실행 중" : "RAW 매칭"}</button>
        <button disabled={rawDisabled} title={rawDisabledReason || "로우 셀렉"} onClick={() => onRawOpen("mark")}><Star size={13} />로우 셀렉</button>
        <button data-primary="true" onClick={() => setModal("upload")}><Upload size={13} />보정본 올리기</button>
        <button data-active={data.event.offers_open === true} onClick={() => void onOffersOpenChange(!data.event.offers_open)}><ShoppingBag size={13} />액자·앨범 {data.event.offers_open ? "공개" : "비공개"}</button>
        <button onClick={onOpenSync}><RefreshCw size={13} />동기화 확인</button>
        <button onClick={onCopyNotice}><Clipboard size={13} />안내 문구 복사</button>
        <button onClick={() => setModal("settings")}><Settings size={13} />설정</button>
      </div>
    </section>
    <footer className={`${bridgeStyles.shortcutBar} ${styles.shortcutBar}`}><div className={bridgeStyles.shortcutHints}><span>↑↓ 고객 이동</span><span>⌥⌘숫자 필터</span><span>⌘F 검색</span><span>⌘+/− 썸네일</span></div><div className={styles.zoomButtons}><button aria-label="썸네일 축소" onClick={() => setThumbnailSize((value) => Math.max(MIN_THUMBNAIL_SIZE, value - THUMBNAIL_STEP))}><Minus size={13} /></button><span>{thumbnailSize}</span><button aria-label="썸네일 확대" onClick={() => setThumbnailSize((value) => Math.min(MAX_THUMBNAIL_SIZE, value + THUMBNAIL_STEP))}><Plus size={13} /></button></div></footer>
    {modal ? <div className={styles.modalBackdrop} onClick={() => setModal(null)}><section className={styles.modal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><header><div><strong>{modal === "upload" ? "보정본 올리기" : "프로젝트 설정"}</strong><span>{data.event.title}</span></div><button aria-label="닫기" onClick={() => setModal(null)}><X /></button></header><div className={styles.modalBody}>{modal === "upload" ? uploadPanel : settingsPanel}</div></section></div> : null}
    {previewPhoto ? <div className={styles.previewBackdrop} onClick={() => setPreviewPhotoId(null)}><div className={styles.previewDialog} onClick={(event) => event.stopPropagation()}><button aria-label="닫기" onClick={() => setPreviewPhotoId(null)}><X /></button>{imageUrls[previewPhoto.id]?.image_url || imageUrls[previewPhoto.id]?.thumbnail_url || previewPhoto.thumbnail_url ? <img src={imageUrls[previewPhoto.id]?.image_url || imageUrls[previewPhoto.id]?.thumbnail_url || previewPhoto.thumbnail_url} alt={previewPhoto.original_file_name} /> : <ImageIcon />}<strong>{previewPhoto.original_file_name}</strong></div></div> : null}
  </section>;
}

function PersonInspector({ person, eventSlug, rawMatchedAt, onOpenPinList, onDeliveryAction }: {
  person: PersonSelectAdminPerson;
  eventSlug: string;
  rawMatchedAt?: string | null;
  onOpenPinList: () => void;
  onDeliveryAction: (action: "reopen" | "extend", personId?: string) => void | Promise<void>;
}) {
  const status = resolvePersonSelectAdminStatus({ submittedAt: person.submitted_at, rawMatched: Boolean(rawMatchedAt), deliveryState: person.delivery_state, deliveries: person.deliveries });
  const retouchLabels = [...new Set(person.choices.flatMap((choice) => choice.retouch_keys))];
  return <div className={styles.inspectorBody}>
    <div className={styles.inspectorTitle}><span className={styles.statusDot} style={{ background: STATUS_COLORS[status] }} /><div><h2>{person.display_name}</h2><p>{PERSON_SELECT_ADMIN_STATUS_LABELS[status]}</p></div></div>
    <dl className={styles.infoList}><div><dt>고객 선택</dt><dd>{person.choices.length}장</dd></div><div><dt>기준 수</dt><dd>{Object.values(person.need_counts).reduce((sum, count) => sum + count, 0)}장</dd></div><div><dt>보정본 진행</dt><dd>{person.delivery_count ?? 0}장</dd></div><div><dt>RAW 매칭</dt><dd>{rawMatchedAt ? formatRelativeTime(rawMatchedAt) : "실행 전"}</dd></div><div><dt>보정 항목</dt><dd>{retouchLabels.length ? `${retouchLabels.length}개` : "기본"}</dd></div></dl>
    {person.choices.some((choice) => choice.memo) ? <section className={styles.inspectorSection}><h3>고객 메모</h3>{person.choices.filter((choice) => choice.memo).map((choice) => <p key={choice.id}>{choice.person_select_images?.original_file_name}<br /><b>{choice.memo}</b></p>)}</section> : null}
    {person.order?.lines.length ? <section className={styles.inspectorSection}><h3>주문 · {formatWon(person.order.total)}</h3>{person.order.lines.map((line, index) => <p key={index}>{line.label}{line.detail ? ` · ${line.detail}` : ""}<b>{line.qty}개 · {formatWon(line.amount)}</b></p>)}</section> : null}
    <div className={styles.inspectorActions}><button onClick={() => void navigator.clipboard.writeText(`${location.origin}/pick/${eventSlug}`)}><Clipboard size={14} />링크 복사</button><button onClick={onOpenPinList}><UserRound size={14} />비밀번호</button>{person.delivery_count ? <button onClick={() => void onDeliveryAction("reopen", person.id)}><RefreshCw size={14} />선택 다시 열기</button> : null}</div>
  </div>;
}

function SharedInspector({ reviewer, deliveryCount, orderOpen }: { reviewer: NonNullable<PersonSelectAdminData["shared"]>["reviewers"][number]; deliveryCount: number; orderOpen: boolean }) {
  const selectedCount = reviewer.selection?.items.length ?? reviewer.draft?.selected_count ?? 0;
  return <div className={styles.inspectorBody}><div className={styles.inspectorTitle}><UserRound /><div><h2>{reviewer.display_name}</h2><p>{reviewer.selection ? "최종 제출" : selectedCount ? "선택 중" : "미선택"}</p></div></div><dl className={styles.infoList}><div><dt>선택 사진</dt><dd>{selectedCount}장</dd></div><div><dt>보정본</dt><dd>{deliveryCount}장</dd></div><div><dt>액자·앨범</dt><dd>{orderOpen ? "공개" : "비공개"}</dd></div><div><dt>마지막 저장</dt><dd>{formatRelativeTime(reviewer.server_last_saved_at ?? null)}</dd></div></dl>{reviewer.selection?.customer_memo || reviewer.draft?.customerMemo ? <section className={styles.inspectorSection}><h3>전체 메모</h3><p>{reviewer.selection?.customer_memo || reviewer.draft?.customerMemo}</p></section> : null}</div>;
}

function PhotoInspector({ eventId, photo, choice, delivery, labels, onDeleteDelivery, onReload, onMessage }: {
  eventId: string;
  photo: WorkspacePhoto;
  choice: PersonSelectAdminChoice | PersonSelectSharedSelectionItem | null;
  delivery: PersonSelectAdminDeliveryItem | null;
  labels: { key: string; label: string }[];
  onDeleteDelivery: (delivery: PersonSelectAdminDeliveryItem) => void | Promise<void>;
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const editableChoice = choice && "retouch_keys" in choice ? choice : null;
  const labelMap = new Map(labels.map((label) => [label.key, label.label]));
  const memo = choice && "memo" in choice ? choice.memo : "";
  const retouchKeys = choice && "retouch_keys" in choice ? choice.retouch_keys : [];
  const customerRating = choice && "customer_rating" in choice ? choice.customer_rating : null;
  const customerColor = choice && "customer_color_label" in choice ? choice.customer_color_label : null;
  const [editing, setEditing] = useState(false);
  const [editKeys, setEditKeys] = useState<string[]>(retouchKeys);
  const [editMemo, setEditMemo] = useState(memo);
  const [saving, setSaving] = useState(false);
  const retouchKeySignature = retouchKeys.join("\u0000");
  useEffect(() => { setEditing(false); setEditKeys(retouchKeySignature ? retouchKeySignature.split("\u0000") : []); setEditMemo(memo); }, [editableChoice?.id, memo, retouchKeySignature]);

  async function saveChoice() {
    if (!editableChoice) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/person-select/${eventId}/choices/${editableChoice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retouch_keys: editKeys, memo: editMemo }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "보정 요청을 저장하지 못했습니다.");
      await onReload();
      setEditing(false);
      onMessage(`${photo.original_file_name} 보정 요청을 저장했습니다.`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "보정 요청을 저장하지 못했습니다.");
    } finally { setSaving(false); }
  }

  return <div className={styles.inspectorBody}><div className={styles.inspectorTitle}><ImageIcon /><div><h2>{photo.original_file_name}</h2><p>{photo.source_rel_path}</p></div></div><dl className={styles.infoList}><div><dt>촬영시각</dt><dd>정보 없음</dd></div><div><dt>고객 선택</dt><dd>{choice ? [customerRating ? `★${customerRating}` : "선택", customerColor ? BRIDGE_COLOR_LABELS[customerColor as 6 | 7 | 8 | 9]?.name : ""].filter(Boolean).join(" · ") : "미선택"}</dd></div><div><dt>보정 요청</dt><dd>{retouchKeys.map((key) => labelMap.get(key) ?? key).join(" · ") || "기본"}</dd></div></dl>{editableChoice ? <section className={styles.inspectorSection}><h3>보정 요청·메모</h3>{editing ? <><div className={styles.editChips}>{labels.map((label) => <button key={label.key} className={editKeys.includes(label.key) ? styles.editChipActive : ""} onClick={() => setEditKeys(togglePersonSelectRetouchKey(editKeys, label.key))}>{label.label}</button>)}</div><textarea className={styles.inspectorTextarea} value={editMemo} maxLength={2_000} onChange={(event) => setEditMemo(event.target.value)} /><div className={styles.editActions}><button disabled={saving} onClick={() => setEditing(false)}>취소</button><button className={styles.saveButton} disabled={saving} onClick={() => void saveChoice()}>{saving ? "저장 중" : "관리자 수정 저장"}</button></div></> : <><p>{memo || "메모 없음"}</p><button className={styles.inspectorEditButton} onClick={() => setEditing(true)}>관리자 수정</button></>}</section> : memo ? <section className={styles.inspectorSection}><h3>고객 메모</h3><p>{memo}</p></section> : null}{delivery ? <section className={styles.inspectorSection}><h3>보정본 버전</h3>{delivery.preview_url ? <img className={styles.inspectorPreview} src={delivery.preview_url} alt={delivery.display_name} /> : null}<p>{delivery.display_name}<b>v{delivery.current_version} · {delivery.status}</b></p>{delivery.customer_memo ? <p className={styles.revisionMemo}>{delivery.customer_memo}</p> : null}<div className={styles.versionList}>{(delivery.versions ?? []).map((version) => <span key={version.version}>v{version.version} · {formatRelativeTime(version.uploaded_at)}</span>)}</div><button className={styles.deleteButton} onClick={() => void onDeleteDelivery(delivery)}><Trash2 size={14} />해당 보정본 삭제</button></section> : <section className={styles.inspectorSection}><h3>보정본</h3><p>아직 연결된 보정본이 없습니다.</p></section>}</div>;
}

