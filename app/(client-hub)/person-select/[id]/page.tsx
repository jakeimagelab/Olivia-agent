"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import PhotoSourcePicker from "@/components/photo-classifier/PhotoSourcePicker";
import { PersonSelectAdminBridgeWorkspace } from "@/components/person-select/admin/PersonSelectAdminBridgeWorkspace";
import { PersonSelectSettingsPanel } from "@/components/person-select/admin/PersonSelectSettingsPanel";
import { PersonSelectUploadPanel } from "@/components/person-select/admin/PersonSelectUploadPanel";
import { PinListDialog } from "@/components/person-select/admin/PinListDialog";
import { RawMatchDialog, RawMatchResult } from "@/components/person-select/admin/RawMatchControls";
import { SelectionSyncDialog } from "@/components/person-select/admin/SelectionSyncDialog";
import { usePersonSelectAdminData } from "@/components/person-select/admin/hooks/usePersonSelectAdminData";
import { usePersonSelectImportController } from "@/components/person-select/admin/hooks/usePersonSelectImportController";
import { usePersonSelectProjectActions } from "@/components/person-select/admin/hooks/usePersonSelectProjectActions";
import { usePersonSelectRawMatchController } from "@/components/person-select/admin/hooks/usePersonSelectRawMatchController";
import { usePersonSelectReviewerActions } from "@/components/person-select/admin/hooks/usePersonSelectReviewerActions";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";
import { useDesktopWindowRoute } from "@/lib/desktopWindowContext";
import { emitShellSelection } from "@/lib/olivia/desktop/shellSelection";
import { buildPersonSelectAdminPresentation } from "@/lib/person-select/adminPresentation";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { loadRemoteWorkerStatus } from "@/lib/remote-jobs/workerStatusClient";
import type { CustomerBridgeImage } from "@/lib/select-gallery/customerBridgeTypes";
import type { SelectionMediaVariant } from "@/lib/select-gallery/mediaLoading";
import type { PersonSelectAdminImage } from "@/lib/person-select/adminData";

type Layout = PersonSelectImportLayout;

export default function PersonSelectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const windowRoute = useDesktopWindowRoute();
  const routePath = windowRoute.routeHref ? new URL(windowRoute.routeHref, "https://olivia.local").pathname : "";
  const routeId = routePath.match(/^\/person-select\/([^/]+)\/?$/)?.[1];
  const id = routeId || params.id;
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const loadImageUrls = useCallback(async (imageIds: string[], options?: { variant: SelectionMediaVariant }) => {
    const response = await fetch(`/api/person-select/${id}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageIds, variant: options?.variant }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) throw new Error(body.error || "사진 주소를 불러오지 못했습니다.");
    return body.images as Record<string, Pick<CustomerBridgeImage, "image_url" | "thumbnail_url">>;
  }, [id]);
  const loadImages = useCallback(async (scope: { kind: "all" | "person" | "group"; ownerId?: string; groupLabel?: string }) => {
    const params = new URLSearchParams({ scope: scope.kind });
    if (scope.ownerId) params.set("ownerId", scope.ownerId);
    if (scope.groupLabel) params.set("groupLabel", scope.groupLabel);
    const response = await fetch(`/api/person-select/${id}/images?${params.toString()}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok || !Array.isArray(body.images)) throw new Error(body.error || "사진 목록을 불러오지 못했습니다.");
    return body.images as PersonSelectAdminImage[];
  }, [id]);

  useEffect(() => {
    loadRemoteWorkerStatus<{ worker?: { online?: boolean } }>()
      .then((body) => setWorkerOnline(body.worker?.online ?? false))
      .catch(() => setWorkerOnline(false));
  }, []);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const presentation = useMemo(() => data ? buildPersonSelectAdminPresentation({ data, layout, selectedReviewerId, selectedPersonId: selectedId, origin }) : null, [data, layout, origin, selectedId, selectedReviewerId]);
  useEffect(() => {
    emitShellSelection({ clear: true, sourceAppId: "person-select", sourceWindowId: "person-select" });
    return () => emitShellSelection({ clear: true, sourceAppId: "person-select", sourceWindowId: "person-select" });
  }, []);

  const isShared = presentation?.isShared ?? false;
  const currentLayout: Layout = presentation?.currentLayout ?? layout ?? "person-folders";
  const importController = usePersonSelectImportController({ eventId: id, projectTitle: data?.event.title ?? "", layout: currentLayout, isShared, load, onOriginalImportComplete: () => undefined, setMessage: setError });
  const reviewerActions = usePersonSelectReviewerActions({ eventId: id, isShared, load, setSelectedReviewerId, setMessage: setError });
  const {
    rawDialogOpen, setRawDialogOpen, rawMode, setRawMode, rawSource, changeRawSource,
    rawLabelNames, setRawLabelNames, rawReviewerScope, setRawReviewerScope, rawPreview,
    rawBusy, rawDisabledReason, rawDisabled, rawPathPlan, displayedRawResult, rawResult,
    openRawMatchDialog, startRawMatch,
  } = usePersonSelectRawMatchController({ eventId: id, data, isShared, workerOnline, load, setMessage: setError });
  const { pickerOpen, setPickerOpen, changeDeliveryOwner, selectRemotePath } = importController;
  const {
    deleteOpen, setDeleteOpen, deleteConfirmTitle, setDeleteConfirmTitle, deleting,
    saveGroups, saveSettings, openDeleteDialog, deleteProject,
  } = usePersonSelectProjectActions({ eventId: id, data, assignments, load, navigate, setMessage: setError });

  if (!data || !presentation) return <main className={styles.shell}><div className={styles.loading}>{error || "행사를 불러오는 중이에요"}</div></main>;

  const { sharedReviewers, loginGuide, publicPath, notice } = presentation;
  const rawStatus = displayedRawResult ? <>
    <RawMatchResult result={displayedRawResult} at={rawResult ? null : data.event.raw_matched_at ?? null} busy={rawBusy} onClear={() => void startRawMatch(true)} onRetry={openRawMatchDialog} />
  </> : null;
  const uploadPanel = <PersonSelectUploadPanel eventId={id} controller={importController} currentLayout={currentLayout} onLayoutChange={setLayout} isShared={isShared} workerOnline={workerOnline} people={data.people} sourceRelativePath={data.event.source_relative_path} />;
  const settingsPanel = <>
    <PersonSelectSettingsPanel data={data} onDataChange={setData} reviewerActions={reviewerActions} publicPath={publicPath} loginGuide={loginGuide} notice={notice} onSave={saveSettings} onDelete={openDeleteDialog} />
    {data.groups.length ? <section className={styles.uploadCard} style={{ marginTop: 16 }}><h2>담임 반 연결</h2><p className={styles.summary}>반 사진을 담당 고객에게 연결합니다.</p><div className={styles.groupRows}>{data.groups.map((group) => <div className={styles.groupRow} key={group.label}><strong>{group.label}</strong><select className={styles.select} value={assignments[group.label] || ""} onChange={(event) => setAssignments({ ...assignments, [group.label]: event.target.value })}><option value="">미연결</option>{data.people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select><span>{group.image_count}장</span></div>)}</div><div className={styles.formActions}><button className={styles.secondary} onClick={() => void saveGroups()}>담임 반 연결 저장</button></div></section> : null}
  </>;

  return <main className={`${styles.shell} ${styles.bridgeShell}`}>
    {(error || data.sync?.recent_failure_count) ? <div className={styles.bridgeNoticeStack}>
      {error ? <div className={styles.warning}>{error}</div> : null}
      {data.sync?.recent_failure_count ? <div className={styles.warning} role="alert">최근 고객 저장 실패 {data.sync.recent_failure_count}건이 있습니다. 동기화 확인에서 검토해 주세요.</div> : null}
    </div> : null}
    <PersonSelectAdminBridgeWorkspace
        eventId={id} data={data} selectedPersonId={selectedId} selectedReviewerId={selectedReviewerId}
        rawBusy={rawBusy} rawDisabled={rawDisabled} rawDisabledReason={rawDisabledReason} rawStatus={rawStatus}
        uploadPanel={uploadPanel} settingsPanel={settingsPanel}
        loadImages={loadImages} loadImageUrls={loadImageUrls} onPersonSelect={setSelectedId} onReviewerSelect={setSelectedReviewerId}
        onRawOpen={(mode) => { setRawMode(mode); openRawMatchDialog(); }} onReload={load} onMessage={setError}
        onOpenPinList={() => setPinListOpen(true)} onOpenSync={() => setSyncDialogOpen(true)} onCopyNotice={() => void navigator.clipboard.writeText(notice)}
        onDeliveryAction={changeDeliveryOwner}
        onDeliveryDrop={async (fileNames) => {
          importController.setUploadKind("delivery"); importController.setSourceMode("remote");
          if (workerOnline !== true) { setError("Mac Studio가 꺼져 있어요. 켠 뒤 다시 시도해 주세요."); return; }
          if (!importController.path) { setError(`${fileNames.length}개 파일을 놓았습니다. 먼저 Mac Studio 보정본 폴더를 연결해 주세요.`); setPickerOpen(true); return; }
          setError(`${fileNames.length}개 파일을 확인합니다. 연결된 보정본 폴더 전체에서 자동 매칭합니다.`);
          await importController.startDeliveryImport();
        }}
        onOffersOpenChange={async (open) => { setData({ ...data, event: { ...data.event, offers_open: open } }); await saveSettings({ offers_open: open }); }}
        onBack={() => navigate("/person-select")}
    />
    {rawDialogOpen ? <RawMatchDialog mode={rawMode} onModeChange={setRawMode} source={rawSource} onSourceChange={changeRawSource} labelNames={rawLabelNames} onLabelNamesChange={setRawLabelNames} isShared={isShared} reviewerScope={rawReviewerScope} onReviewerScopeChange={setRawReviewerScope} reviewers={sharedReviewers.filter((reviewer) => reviewer.active)} selectedCount={rawPreview.targets.length} submittedCount={rawPreview.submittedSelectedCount} currentCount={rawPreview.currentUnsubmittedCount} pathPlan={rawPathPlan} busy={rawBusy} disabledReason={!rawPreview.targets.length ? "선택한 기준에 고른 사진이 없어요." : rawDisabledReason} onClose={() => setRawDialogOpen(false)} onRun={() => void startRawMatch()} /> : null}
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
  </main>;
}

