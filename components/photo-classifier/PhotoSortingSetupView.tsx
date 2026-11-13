"use client";

import type { ReactNode } from "react";
import type { SavedSortingSession } from "@/lib/photo-classifier/sortingSession";
import ClassificationModeToggle, { type ClassificationUiMode } from "./ai-auto/ClassificationModeToggle";
import { Btn, C, Card } from "./PhotoSortingUi";
import { PhotoShootingModeControl, type PhotoShootingMode } from "./PhotoShootingModeControl";
import { SavedPhotoSortingSessionBanner } from "./SavedPhotoSortingSessionBanner";

type StartAction = {
  onStart: () => void;
  disabled: boolean;
  label: string;
};

type FieldSetup = {
  classificationMode: ClassificationUiMode;
  onClassificationModeChange: (mode: ClassificationUiMode) => void;
  sourceControl: ReactNode;
  departmentControl: ReactNode;
  compactDepartmentControl: ReactNode;
  prompt: ReactNode;
  analysisSummary: ReactNode;
  sceneProposals: ReactNode;
  classificationProfile: ReactNode;
  advancedSettings: ReactNode;
  autoStart: StartAction;
  advancedStart: StartAction;
  hasSource: boolean;
  departmentReady: boolean;
};

type StudioSetup = {
  settings: ReactNode;
  start: StartAction;
};

function BrowserSupportNotice() {
  return (
    <div style={{padding:14,background:"rgba(214,188,125,.12)",borderRadius:10,fontSize:12,color:"#D6BC7D",border:"1px solid rgba(214,188,125,.36)"}}>
      ⚠️ Chrome 또는 Edge 브라우저에서만 로컬 파일 시스템 접근이 가능합니다.
    </div>
  );
}

function DepartmentPendingNotice() {
  return <div style={{fontSize:10.5,color:C.hint,textAlign:"center"}}>진료과를 확인해야 분류를 시작할 수 있습니다.</div>;
}

export function PhotoSortingSetupView({
  savedSession,
  showSavedSession,
  onRestoreSession,
  onClearSession,
  photoMode,
  onPhotoModeChange,
  field,
  studio,
  showBrowserWarning,
}: {
  savedSession: SavedSortingSession | null;
  showSavedSession: boolean;
  onRestoreSession: (session: SavedSortingSession) => void;
  onClearSession: () => void;
  photoMode: PhotoShootingMode;
  onPhotoModeChange: (mode: PhotoShootingMode) => void;
  field: FieldSetup;
  studio: StudioSetup;
  showBrowserWarning: boolean;
}) {
  const aiAutoActive = photoMode === "field" && field.classificationMode === "ai-auto";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:20,maxWidth: aiAutoActive ? 1120 : 700}}>
      {savedSession && showSavedSession ? (
        <SavedPhotoSortingSessionBanner
          session={savedSession}
          onRestore={onRestoreSession}
          onClear={onClearSession}
        />
      ) : null}

      <PhotoShootingModeControl mode={photoMode} onChange={onPhotoModeChange} />

      {photoMode === "field" ? (
        <>
          <ClassificationModeToggle mode={field.classificationMode} onChange={field.onClassificationModeChange} />
          {aiAutoActive ? (
            <div className="pc-ai-auto-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1.25fr) minmax(340px,.82fr)",gap:16,alignItems:"start"}}>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>폴더 선택</div>
                  <div style={{padding:20}}>{field.sourceControl}</div>
                </Card>
                <Card>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>진료과</div>
                  {field.compactDepartmentControl}
                </Card>
                {field.prompt}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {field.analysisSummary}
                {field.sceneProposals}
                {showBrowserWarning ? <BrowserSupportNotice /> : null}
                <Btn onClick={field.autoStart.onStart} disabled={field.autoStart.disabled}>{field.autoStart.label}</Btn>
                {field.hasSource && !field.departmentReady ? <DepartmentPendingNotice /> : null}
                {field.classificationProfile}
              </div>
            </div>
          ) : (
            <>
              <Card>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>폴더 선택</div>
                <div style={{padding:20}}>{field.sourceControl}</div>
              </Card>
              <Card>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:600,color:C.teal}}>진료과</div>
                {field.departmentControl}
              </Card>
              {field.advancedSettings}
              {showBrowserWarning ? <BrowserSupportNotice /> : null}
              <Btn onClick={field.advancedStart.onStart} disabled={field.advancedStart.disabled}>{field.advancedStart.label}</Btn>
              {field.hasSource && !field.departmentReady ? <DepartmentPendingNotice /> : null}
            </>
          )}
        </>
      ) : (
        <>
          {studio.settings}
          {showBrowserWarning ? <BrowserSupportNotice /> : null}
          <Btn style={{background:C.purple}} onClick={studio.start.onStart} disabled={studio.start.disabled}>{studio.start.label}</Btn>
        </>
      )}
    </div>
  );
}
