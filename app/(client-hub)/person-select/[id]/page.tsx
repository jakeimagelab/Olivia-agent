"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, Clipboard, Download, Folder, FolderOpen, Info, Link2, MoreHorizontal, RefreshCw, SlidersHorizontal, Upload, UserRound, UsersRound, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { formatSeoulDeadline } from "@/lib/person-select/date";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import { PERSON_SELECT_ACCESS_MODE_LABELS } from "@/lib/person-select/projectSettings";
import { formatRelativeTime, formatWon } from "@/lib/person-select/format";
import type { PersonSelectAdminPerson as Person } from "@/lib/person-select/adminPerson";
import { readApiResponse } from "@/lib/http/apiResponse";
import { loadRemoteWorkerStatus } from "@/lib/remote-jobs/workerStatusClient";
import CustomerBridgeSelect, { type CustomerBridgeImage } from "@/components/select-gallery/CustomerBridgeSelect";
import { RawMatchDialog, RawMatchResult } from "@/components/person-select/admin/RawMatchControls";
import { PinListDialog } from "@/components/person-select/admin/PinListDialog";
import { PersonDetailDrawer } from "@/components/person-select/admin/PersonDetailDrawer";
import { SelectionSyncDialog } from "@/components/person-select/admin/SelectionSyncDialog";
import { PersonSelectUploadPanel } from "@/components/person-select/admin/PersonSelectUploadPanel";
import { PersonSelectSettingsPanel } from "@/components/person-select/admin/PersonSelectSettingsPanel";
import { usePersonSelectAdminData } from "@/components/person-select/admin/hooks/usePersonSelectAdminData";
import { usePersonSelectReviewerActions } from "@/components/person-select/admin/hooks/usePersonSelectReviewerActions";
import { usePersonSelectRawMatchController } from "@/components/person-select/admin/hooks/usePersonSelectRawMatchController";
import { usePersonSelectImportController } from "@/components/person-select/admin/hooks/usePersonSelectImportController";
import { usePersonSelectProjectActions } from "@/components/person-select/admin/hooks/usePersonSelectProjectActions";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

type Layout = PersonSelectImportLayout;
type Filter = "all" | "done" | "saving" | "unseen" | "delivery_revision";

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
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Person | null>(null);
  const [pinListOpen, setPinListOpen] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
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
  const currentLayout: Layout = layout ?? (isShared ? "project" : data?.people.length && data.event.source_layout === "school" ? "school" : "person-folders");
  const handleOriginalImportComplete = useCallback(() => setTab("matching"), []);
  const importController = usePersonSelectImportController({
    eventId: id,
    projectTitle: data?.event.title ?? "",
    layout: currentLayout,
    isShared,
    load,
    onOriginalImportComplete: handleOriginalImportComplete,
    setMessage: setError,
  });
  const reviewerActions = usePersonSelectReviewerActions({
    eventId: id,
    isShared,
    load,
    setSelectedReviewerId,
    setMessage: setError,
  });
  const {
    rawDialogOpen,
    setRawDialogOpen,
    rawMode,
    setRawMode,
    rawSource,
    changeRawSource,
    rawLabelNames,
    setRawLabelNames,
    rawReviewerScope,
    setRawReviewerScope,
    rawPreview,
    rawBusy,
    rawDisabledReason,
    rawDisabled,
    rawPathPlan,
    displayedRawResult,
    rawResult,
    openRawMatchDialog,
    startRawMatch,
  } = usePersonSelectRawMatchController({
    eventId: id,
    data,
    isShared,
    workerOnline,
    load,
    setMessage: setError,
  });
  const {
    pickerOpen,
    setPickerOpen,
    result,
    changeDeliveryOwner,
    selectRemotePath,
  } = importController;
  const {
    deleteOpen,
    setDeleteOpen,
    deleteConfirmTitle,
    setDeleteConfirmTitle,
    deleting,
    saveGroups,
    saveSettings,
    openDeleteDialog,
    deleteProject,
  } = usePersonSelectProjectActions({
    eventId: id,
    data,
    assignments,
    load,
    navigate,
    setMessage: setError,
  });
  if (!data) return <main className={styles.shell}><div className={styles.loading}>{error || "행사를 불러오는 중이에요"}</div></main>;
  // 가져오기 방식: 이미 가져온 행사는 그때 방식, 처음이면 이름 폴더 방식
  const sharedReviewers = data.shared?.reviewers ?? [];
  const selectedReviewer = sharedReviewers.find((reviewer) => reviewer.id === selectedReviewerId) ?? sharedReviewers[0] ?? null;
  const selectedSharedSelection = selectedReviewer?.selection ?? null;
  const displayedSharedItems = selectedSharedSelection?.items ?? selectedReviewer?.draft?.items ?? [];
  const displayedSharedMemo = selectedSharedSelection?.customer_memo ?? selectedReviewer?.draft?.customerMemo ?? "";
  const isSchool = currentLayout === "school";
  const personWord = isSchool ? "선생님" : "이름";
  const categories = data.event.categories ?? [];
  const categoryLabels = new Map(categories.map((item) => [item.key, item.label]));
  const counts = { done: data.people.filter((person) => person.status_label.includes("제출")).length, saving: data.people.filter((person) => person.status_label === "선택 중").length, unseen: data.people.filter((person) => person.status_label === "미접속").length, deliveryRevision: data.people.filter((person) => Number(person.delivery_revision_count ?? 0) > 0).length };
  const totalPhotos = isShared ? Number(data.shared?.image_count ?? 0) : data.people.reduce((sum, person) => sum + Object.entries(person.image_counts ?? {}).filter(([key]) => key !== "homeroom").reduce((acc, [, value]) => acc + value, 0), 0);
  const pickText = isShared ? `프로젝트 공용 셀렉 · 검토자 ${sharedReviewers.filter((reviewer) => !reviewer.is_legacy).length}명` : categories.length === 1 ? `한 사람당 ${categories[0].pick}장` : categories.map((item) => `${item.label} ${item.pick}장`).join(" · ");
  const sourceFolder = folderName(data.event.source_relative_path);
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
  const rawAction = <button className={styles.bridgeRawButton} disabled={rawDisabled} title={rawDisabledReason || "RAW 매칭 기준을 확인합니다."} onClick={openRawMatchDialog}><Link2 size={15} />{rawBusy ? "RAW 매칭 중" : "RAW 매칭"}</button>;
  const rawStatus = rawDisabledReason || displayedRawResult ? <>{rawDisabledReason ? <p className={styles.rawDisabledReason}>{rawDisabledReason}</p> : null}<RawMatchResult result={displayedRawResult} at={rawResult ? null : data.event.raw_matched_at ?? null} busy={rawBusy} onClear={() => void startRawMatch(true)} onRetry={openRawMatchDialog} /></> : null;
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
      {tab === "upload" ? <PersonSelectUploadPanel
        controller={importController}
        currentLayout={currentLayout}
        onLayoutChange={setLayout}
        isShared={isShared}
        workerOnline={workerOnline}
        people={data.people}
        sourceRelativePath={data.event.source_relative_path}
      /> : null}
      {tab === "settings" ? <PersonSelectSettingsPanel
        data={data}
        onDataChange={setData}
        reviewerActions={reviewerActions}
        publicPath={publicPath}
        loginGuide={loginGuide}
        notice={notice}
        onSave={saveSettings}
        onDelete={openDeleteDialog}
      /> : null}
    </section>
    {rawDialogOpen ? <RawMatchDialog
      mode={rawMode}
      onModeChange={setRawMode}
      source={rawSource}
      onSourceChange={changeRawSource}
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
    {pickerOpen ? <PhotoSourcePicker targetWorker="jake-macstudio-01" sourceScope="person-select" onCancel={() => setPickerOpen(false)} onSelectRemote={(selection) => selectRemotePath(selection.path)} /> : null}
    {pinListOpen ? <PinListDialog eventId={id} onClose={() => setPinListOpen(false)} onUpdated={load} /> : null}
    {syncDialogOpen ? <SelectionSyncDialog eventTitle={data.event.title} reviewers={data.shared?.reviewers ?? []} people={data.people} recentFailureCount={data.sync?.recent_failure_count ?? 0} recentFailures={data.sync?.recent_failures ?? []} onClose={() => setSyncDialogOpen(false)} onRefresh={() => void load()} /> : null}
    {deleteOpen ? <div className={styles.modalBackdrop} onClick={() => { if (!deleting) setDeleteOpen(false); }}>
      <section className={`${styles.pinDialog} ${styles.deleteDialog}`} role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalTop}><div><p className={styles.eyebrow}>되돌릴 수 없는 작업</p><h2 id="delete-project-title">프로젝트 삭제</h2><p>사진, 참가자, 선택·주문·제출 기록과 업로드한 미리보기 파일을 함께 삭제합니다.</p></div><button type="button" className={styles.weak} aria-label="닫기" disabled={deleting} onClick={() => setDeleteOpen(false)}><X size={20} /></button></div>
        <div className={styles.warning} role="alert">삭제하려면 프로젝트명 <strong>{data.event.title}</strong>을 아래에 정확히 입력해 주세요. 업로드 중인 프로젝트는 삭제할 수 없습니다.</div>
        <div className={styles.field}><label htmlFor="delete-project-confirm">프로젝트명 확인</label><input id="delete-project-confirm" className={styles.input} autoFocus value={deleteConfirmTitle} disabled={deleting} onChange={(event) => setDeleteConfirmTitle(event.target.value)} autoComplete="off" /></div>
        <div className={styles.modalActions}><button type="button" className={styles.secondary} disabled={deleting} onClick={() => setDeleteOpen(false)}>취소</button><button type="button" className={styles.dangerSolid} disabled={deleting || deleteConfirmTitle.trim() !== data.event.title} onClick={() => void deleteProject()}>{deleting ? "삭제 중" : "영구 삭제"}</button></div>
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
