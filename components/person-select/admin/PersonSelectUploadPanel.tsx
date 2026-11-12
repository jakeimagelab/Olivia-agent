"use client";

import { FolderOpen, Monitor, Server, Upload, UserRound, UsersRound } from "lucide-react";

import type { PersonSelectAdminPerson } from "@/lib/person-select/adminPerson";
import type { PersonSelectImportLayout } from "@/lib/person-select/localImport";
import { DeliveryImportResult } from "@/components/person-select/upload/DeliveryImportResult";
import type { usePersonSelectImportController } from "@/components/person-select/admin/hooks/usePersonSelectImportController";
import styles from "@/components/person-select/PersonSelectAdmin.module.css";

export function PersonSelectUploadPanel({
  controller,
  currentLayout,
  onLayoutChange,
  isShared,
  workerOnline,
  people,
  sourceRelativePath,
}: {
  controller: ReturnType<typeof usePersonSelectImportController>;
  currentLayout: PersonSelectImportLayout;
  onLayoutChange: (layout: PersonSelectImportLayout) => void;
  isShared: boolean;
  workerOnline: boolean | null;
  people: PersonSelectAdminPerson[];
  sourceRelativePath: string | null | undefined;
}) {
  const {
    path,
    setPath,
    sourceMode,
    setSourceMode,
    uploadKind,
    setUploadKind,
    localFolderName,
    localScan,
    localInputRef,
    jobId,
    result,
    deliveryJobId,
    deliveryResult,
    deliveryAssignments,
    eventUploadJob,
    localBusy,
    localProgress,
    setPickerOpen,
    selectLocalFolder,
    selectLocalFileList,
    startImport,
    startDeliveryImport,
    assignDelivery,
    resumeLocalImport,
    clearLocalSelection,
    updateDeliveryAssignment,
  } = controller;
  const isSchool = currentLayout === "school";
  const groupFolders = Array.isArray(result?.groupFolders) ? (result.groupFolders as unknown[]).map(String) : [];
  const unnamedFolders = Array.isArray(result?.unnamedFolders) ? (result.unnamedFolders as unknown[]).map(String) : [];

  return <div className={styles.uploadGrid}>
    <section className={styles.uploadCard}>
      <h2>폴더에서 사진 올리기</h2>
      <div className={styles.segment} style={{ margin: "6px 0 16px" }}><button className={uploadKind === "original" ? styles.segmentActive : ""} onClick={() => setUploadKind("original")}>원본 올리기</button><button className={uploadKind === "delivery" ? styles.segmentActive : ""} onClick={() => { setUploadKind("delivery"); setSourceMode("remote"); }}>보정본 올리기</button></div>
      {uploadKind === "original" ? <>
        <div className={styles.field}><label>사진이 있는 위치</label><div className={styles.segment} style={{ margin: "6px 0 12px" }}>{([["local", "이 기기", Monitor], ["remote", "Mac Studio", Server]] as const).map(([key, label, Icon]) => <button key={key} disabled={localBusy} className={sourceMode === key ? styles.segmentActive : ""} onClick={() => setSourceMode(key)}><Icon size={15} />{label}</button>)}</div></div>
        <div className={styles.segment} style={{ margin: "6px 0 12px" }}>{(isShared ? [["project", "프로젝트 전체 폴더", UsersRound]] as const : [["person-folders", "이름 폴더 (김춘자/JPG원본)", UserRound], ["school", "학교 (선생님프로필·담임선생님)", UsersRound]] as const).map(([key, label, Icon]) => <button key={key} disabled={localBusy} className={currentLayout === key ? styles.segmentActive : ""} onClick={() => { onLayoutChange(key); clearLocalSelection(); }}><Icon size={15} />{label}</button>)}</div>
        <p className={styles.summary}>{sourceMode === "local" ? "지금 Olivia를 연 기기" : "Mac Studio"}에서 {isShared ? "프로젝트" : isSchool ? "학교전달" : "촬영"} 폴더를 골라 썸네일과 1600px 미리보기만 올립니다.</p>
        {sourceMode === "remote" && workerOnline === false ? <div className={styles.warning}>Mac Studio가 꺼져 있어요. 켜진 뒤 다시 시도해 주세요.</div> : null}
        <div className={styles.selectedPath}>{sourceMode === "local" ? localFolderName || "선택된 로컬 폴더가 없습니다." : path || "선택된 Mac Studio 폴더가 없습니다."}</div>
        <input ref={(input) => { localInputRef.current = input; input?.setAttribute("webkitdirectory", ""); input?.setAttribute("directory", ""); }} type="file" accept="image/jpeg,.jpg,.jpeg" multiple className={styles.hiddenInput} onChange={(event) => selectLocalFileList(event.currentTarget.files)} />
        <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} disabled={sourceMode === "remote" ? workerOnline === false : localBusy} onClick={() => sourceMode === "local" ? void selectLocalFolder() : setPickerOpen(true)}><FolderOpen size={15} />{eventUploadJob?.needs_file_reselection ? "같은 폴더 다시 선택" : "폴더 선택"}</button><button className={styles.primary} disabled={sourceMode === "local" ? localBusy || !localScan?.files.length : workerOnline === false || !path || Boolean(jobId && !result?.error && !result?.photoCount)} onClick={() => void startImport()}><Upload size={15} />{localBusy ? "업로드 진행 중" : eventUploadJob?.needs_file_reselection ? "남은 사진 이어서 올리기" : "사진 올리기"}</button></div>
        {sourceMode === "local" && localScan ? <p className={styles.summary}>올릴 JPG {localScan.files.length.toLocaleString()}장{localScan.groupFolders.length ? ` · 그룹 폴더 ${localScan.groupFolders.length}개 제외` : ""}{localScan.unnamedFolders.length ? ` · 이름 미변경 ${localScan.unnamedFolders.length}개 제외` : ""}</p> : null}
        {sourceMode === "local" && localBusy ? <div className={styles.result}>로컬 사진 {localProgress.current.toLocaleString()} / {localProgress.total.toLocaleString()}장 처리 중{localProgress.fileName ? ` · ${localProgress.fileName}` : ""}</div> : null}
        {sourceMode === "local" && eventUploadJob?.status === "paused" ? <div className={styles.warning}>업로드가 일시정지됐어요. <button className={styles.secondary} onClick={() => void resumeLocalImport()}>계속</button></div> : null}
        {sourceMode === "local" && eventUploadJob?.needs_file_reselection && !localScan?.files.length ? <div className={styles.warning}>새로고침 뒤에는 브라우저가 로컬 파일 권한을 잃습니다. 같은 원본 폴더를 다시 선택하면 이미 성공한 사진은 건너뛰고 이어서 올립니다.</div> : null}
        {sourceMode === "local" && !localScan?.files.length ? <p className={styles.disabledReason}>사진을 올리려면 이 기기의 {isSchool ? "학교전달" : "촬영"} 폴더를 먼저 선택하세요.</p> : null}
        {sourceMode === "remote" && !path && workerOnline !== false ? <p className={styles.disabledReason}>사진을 올리려면 Mac Studio의 {isSchool ? "학교전달" : "촬영"} 폴더를 먼저 선택하세요.</p> : null}
        {sourceMode === "remote" ? <div className={styles.field} style={{ marginTop: 20 }}><label>경로 직접 입력</label><input className={styles.input} value={path} onChange={(event) => setPath(event.target.value)} placeholder={isSchool ? "/Users/jakemacstudio/UGnasync/.../학교전달" : "/Volumes/Agentstation(M.2SSD)/.../1031_촬영폴더"} /><small className={styles.summary}>Mac Studio의 폴더 경로를 그대로 붙여넣어도 돼요.</small></div> : null}
        {sourceMode === "local" && !sourceRelativePath ? <p className={styles.summary}>RAW 매칭은 같은 원본 폴더를 Mac Studio 위치에서 다시 선택해 사진 올리기를 실행하면 연결됩니다. 이미 올라온 사진은 건너뜁니다.</p> : null}
        {result ? <div className={styles.result}>{result.photoCount !== undefined ? <><div>{`사진 ${Number(result.photoCount).toLocaleString()}장 · 저장 완료 ${Number(result.importedCount ?? eventUploadJob?.success_count ?? 0).toLocaleString()}장 · 실패 ${Number(result.failedCount ?? 0).toLocaleString()}장`}</div>{result.message ? <div>{String(result.message)}</div> : null}{Array.isArray(result.skippedFolders) && result.skippedFolders.length ? <div className={styles.skippedFolders}>건너뛴 폴더: {result.skippedFolders.map(String).join(" / ")}</div> : null}{unnamedFolders.length ? <div className={styles.warning}>이름을 아직 안 바꾼 폴더라 올리지 않았어요: {unnamedFolders.join(" / ")}</div> : null}{groupFolders.length ? <div className={styles.skippedFolders}>그룹 사진은 고객에게 올리지 않았어요: {groupFolders.join(" / ")}</div> : null}</> : String(result.message || result.error || "처리 중이에요.")}</div> : null}
      </> : <>
        <div className={styles.notice}>보정 완료 JPG/JPEG 폴더를 Mac Studio에서 선택합니다. 원본 파일은 그대로 private Storage에 보관하고, 고객 화면에는 2000px 미리보기를 사용합니다.</div>
        {workerOnline === false ? <div className={styles.warning}>Mac Studio가 꺼져 있어요. 켜진 뒤 다시 시도해 주세요.</div> : null}
        <div className={styles.selectedPath}>{path || "선택된 Mac Studio 보정본 폴더가 없습니다."}</div>
        <div className={styles.actions} style={{ justifyContent: "flex-start" }}><button className={styles.secondary} disabled={workerOnline === false || Boolean(deliveryJobId)} onClick={() => setPickerOpen(true)}><FolderOpen size={15} />폴더 선택</button><button className={styles.primary} disabled={workerOnline !== true || !path || Boolean(deliveryJobId)} onClick={() => void startDeliveryImport()}><Upload size={15} />{deliveryJobId ? "보정본 올리는 중" : "보정본 올리기"}</button></div>
        <div className={styles.field} style={{ marginTop: 18 }}><label>경로 직접 입력</label><input className={styles.input} value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Volumes/Agentstation(M.2SSD)/.../보정본" /><small className={styles.summary}>Mac Studio에서 보이는 폴더 경로를 입력합니다. Vercel 서버를 거쳐 파일을 전송하지 않습니다.</small></div>
        {deliveryResult ? <DeliveryImportResult result={deliveryResult} people={people} isShared={isShared} assignments={deliveryAssignments} busy={Boolean(deliveryJobId)} onRetry={() => void startDeliveryImport()} onAssignmentChange={updateDeliveryAssignment} onAssign={(deliveryId) => void assignDelivery(deliveryId)} /> : null}
      </>}
    </section>
    <aside className={styles.uploadCard}><h2>{uploadKind === "delivery" ? "보정본 연결 기준" : "가져오는 항목"}</h2>{uploadKind === "delivery" ? <><div className={styles.notice}>촬영시각 일치 → 파일명 앞 이름 → 상위 폴더 이름 순으로 고객과 연결합니다.<br />연결하지 못한 파일은 업로드 결과에서 직접 지정할 수 있습니다.</div><p className={styles.summary}>같은 파일명을 다시 올리면 새 버전으로 보관합니다. 고객이 수정 요청한 사진은 새 버전이 올라오면 “수정됨”으로 표시됩니다.</p></> : isShared ? <><div className={styles.notice}>선택한 프로젝트 폴더의 JPG를 하위 폴더까지 가져옵니다.<br />사람 계정이나 개인별 PIN은 만들지 않습니다.</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 상대경로를 보존한 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : isSchool ? <><div className={styles.notice}>선생님프로필 → 사람 이름으로 연결<br />담임선생님 → 반 단위로 등록 후 아래에서 연결</div><p className={styles.summary}>학생사진 폴더는 건너뛰고 가져오지 않습니다.<br />원본은 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.</p></> : <><div className={styles.notice}>김춘자 / 이지영 … 폴더 이름 → 로그인 이름<br />각 폴더 안 JPG원본 → 그 사람만 보는 사진<br />그룹1, 그룹2 … → 고객에게 올리지 않음<br />개인1, 개인2 … → 이름을 바꾼 뒤 다시 올리기</div><p className={styles.summary}>원본과 RAW는 업로드하지 않습니다. 480px 썸네일과 1600px 미리보기만 private Storage에 저장합니다.<br />RAW 매칭은 각 이름 폴더 안에서 같은 파일 이름의 RAW를 찾아 촬영 폴더/Selected_RAW/이름 으로 복사합니다.</p></>}</aside>
  </div>;
}
