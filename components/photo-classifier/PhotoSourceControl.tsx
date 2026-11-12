"use client";

import type { MouseEventHandler, PointerEventHandler } from "react";
import RemoteJobProgress from "@/components/photo-workspace/RemoteJobProgress";
import type { RemotePhotoSortJob } from "@/lib/photo-classifier/remotePhotoSort";
import type { ExecutionMode } from "@/lib/photo-classifier/photoSource";
import type { RemotePhotoPollingState } from "@/lib/store/useRemotePhotoJobStore";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import { C } from "@/lib/theme";
import type { RemoteWorkFolderCheckState } from "./useRemoteWorkFolderCheck";

function isSimulatedRemoteResult(result: unknown): boolean {
  if (!result) return false;
  if (typeof result === "string") return result.toUpperCase().includes("SIMULATED");
  if (typeof result !== "object" || Array.isArray(result)) return false;
  return Object.values(result).some(
    (value) => typeof value === "string" && value.toUpperCase() === "SIMULATED",
  );
}

export function PhotoSourceControl({
  emptyLabel,
  executionMode,
  localFolderName,
  remoteSelection,
  workFolderState,
  onRetryWorkFolder,
  workerOffline,
  sortActive,
  sortSubmitting,
  remoteJobActive,
  remoteJob,
  pollingState,
  pollingMessage,
  sortError,
  onCancelRemoteJob,
  onFolderPointerDown,
  onFolderClick,
  folderError,
}: {
  emptyLabel: string;
  executionMode: ExecutionMode;
  localFolderName: string | null;
  remoteSelection: RemoteNasSelection | null;
  workFolderState: RemoteWorkFolderCheckState;
  onRetryWorkFolder: (sourceFolder: string) => void;
  workerOffline: boolean;
  sortActive: boolean;
  sortSubmitting: boolean;
  remoteJobActive: boolean;
  remoteJob: RemotePhotoSortJob | null;
  pollingState: RemotePhotoPollingState;
  pollingMessage: string;
  sortError: string;
  onCancelRemoteJob: () => void;
  onFolderPointerDown: PointerEventHandler<HTMLButtonElement>;
  onFolderClick: MouseEventHandler<HTMLButtonElement>;
  folderError: string;
}) {
  const selected = executionMode === "LOCAL_DIRECT" ? Boolean(localFolderName) : Boolean(remoteSelection);
  const simulated = remoteJob?.status === "COMPLETED" && isSimulatedRemoteResult(remoteJob.result);

  return (
    <>
      <button
        type="button"
        disabled={sortActive || (executionMode === "REMOTE_WORKER" && workerOffline)}
        onPointerDown={onFolderPointerDown}
        onClick={onFolderClick}
        style={{
          width:"100%", minHeight:52, border:`1.5px dashed ${C.border}`, borderRadius:10,
          background:C.surface, cursor:sortActive||workerOffline?"not-allowed":"pointer", fontSize:13, fontWeight:500,
          color:selected?C.green:C.teal, display:"flex", alignItems:"center", textAlign:"left",
          gap:10, padding:"10px 18px", fontFamily:"inherit",opacity:sortActive||workerOffline ? .64 : 1,
        }}
      >
        {executionMode === "LOCAL_DIRECT" && localFolderName ? (
          <><span>✅</span>{localFolderName}</>
        ) : executionMode === "REMOTE_WORKER" && remoteSelection ? (
          <><span>✅</span>{remoteSelection.rootName}{remoteSelection.displayPath ? ` > ${remoteSelection.displayPath.replaceAll("/", " > ")}` : ""}</>
        ) : executionMode === "REMOTE_WORKER" ? (
          <><span>🖥</span>NAS 작업 폴더 선택</>
        ) : (
          <><span>📂</span>{emptyLabel}</>
        )}
      </button>

      {executionMode === "REMOTE_WORKER" && remoteSelection ? (
        <div style={{marginTop:8,padding:"9px 12px",background:"rgba(232,93,44,.10)",borderRadius:8,fontSize:11,color:"#FFC3AD",border:"1px solid rgba(232,93,44,.34)",lineHeight:1.55}}>
          이 경로의 파일은 브라우저로 전송하지 않고 Mac Studio에서 처리합니다.
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && remoteSelection && workFolderState.status === "checking" ? (
        <div aria-live="polite" style={{marginTop:8,padding:"10px 12px",background:"rgba(53,173,147,.12)",borderRadius:8,fontSize:11,color:"#A8F1DC",border:`1px solid ${C.border}`,lineHeight:1.55}}>
          <strong>Agentstation 작업본을 확인하고 있습니다.</strong><div>선택한 폴더와 같은 작업본 경로만 읽기 전용으로 확인합니다.</div>
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && workFolderState.status === "available" ? (
        <div aria-live="polite" style={{marginTop:8,padding:"10px 12px",background:"rgba(53,173,147,.12)",borderRadius:8,fontSize:11,color:"#A8F1DC",border:"1px solid rgba(79,216,184,.3)",lineHeight:1.55}}>
          <strong>작업본 확인 완료 — 새 JPG 복사와 분류를 시작할 수 있습니다.</strong><div>Agentstation JPG전체 작업본이 없습니다.</div><div style={{wordBreak:"break-all"}}>작업본: {workFolderState.result.jpgWorkFolder}</div>
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && workFolderState.status === "resume" ? (
        <div aria-live="polite" style={{marginTop:8,padding:"10px 12px",background:"rgba(53,173,147,.12)",borderRadius:8,fontSize:11,color:"#A8F1DC",border:"1px solid rgba(79,216,184,.3)",lineHeight:1.55}}>
          <strong>기존 JPG 작업본 확인 완료 — 빠진 파일만 확인해 이어서 복사합니다.</strong><div>같은 파일명은 SHA-256이 일치할 때만 재사용합니다.</div><div style={{wordBreak:"break-all"}}>작업본: {workFolderState.result.jpgWorkFolder}</div>
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && workFolderState.status === "error" ? (
        <div aria-live="polite" style={{marginTop:8,padding:"10px 12px",background:"rgba(232,93,44,.10)",borderRadius:8,fontSize:11,color:"#FFC3AD",border:"1px solid rgba(232,93,44,.34)",lineHeight:1.55}}>
          <strong>Agentstation 작업본을 확인하지 못했습니다.</strong><div>{workFolderState.message}</div>
          <button type="button" onClick={() => onRetryWorkFolder(workFolderState.sourceFolder)} style={{marginTop:7,border:0,borderRadius:6,padding:"5px 8px",fontSize:11,fontWeight:500,color:C.teal,background:C.surface,cursor:"pointer",fontFamily:"inherit"}}>다시 확인</button>
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && workerOffline ? (
        <div style={{marginTop:8,padding:"9px 12px",background:"rgba(232,93,44,.10)",borderRadius:8,fontSize:11,color:"#FFC3AD",border:"1px solid rgba(232,93,44,.34)"}}>
          Mac Studio 연결을 확인해주세요.
        </div>
      ) : null}

      {executionMode === "REMOTE_WORKER" && (sortSubmitting || remoteJobActive || sortError) ? (
        <>
          {sortSubmitting && !remoteJob ? (
            <div style={{marginTop:8,padding:"10px 12px",borderRadius:8,fontSize:11,background:"rgba(53,173,147,.12)",color:"#A8F1DC",border:`1px solid ${C.border}`}}>
              <strong>Mac Studio에 작업을 요청하고 있습니다.</strong>
            </div>
          ) : null}
          {remoteJobActive ? <>
            <RemoteJobProgress
              job={remoteJob}
              pollingState={pollingState}
              pollingMessage={pollingMessage}
              onCancel={onCancelRemoteJob}
            />
            {simulated ? <div style={{marginTop:5,fontSize:10,color:C.hint}}>DRY RUN 결과입니다.</div> : null}
          </> : null}
          {sortError ? (
            <div style={{marginTop:8,padding:"10px 12px",borderRadius:8,fontSize:11,background:"rgba(232,93,44,.10)",color:"#FFC3AD",border:"1px solid rgba(232,93,44,.34)"}}>
              <strong>작업 요청을 보내지 못했습니다.</strong><div>{sortError}</div>
            </div>
          ) : null}
        </>
      ) : null}

      {folderError ? (
        <div style={{marginTop:8,padding:"8px 12px",background:"rgba(214,188,125,.12)",borderRadius:8,fontSize:11,color:"#D6BC7D",border:"1px solid rgba(214,188,125,.36)"}}>
          ⚠️ {folderError}
        </div>
      ) : null}
    </>
  );
}
