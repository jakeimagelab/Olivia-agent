"use client";

import type { ReactNode } from "react";
import { FolderTree } from "lucide-react";

import { Stepper } from "@/components/workspace-shell/Stepper";
import type { MedicalDepartment } from "@/lib/photo-classifier/types";
import { DEPARTMENT_DISPLAY } from "@/lib/photo-classifier/types";
import type { StudioSubMode } from "@/lib/photo-classifier/studioGrouping";
import type { PhotoShootingMode } from "./PhotoShootingModeControl";
import { C } from "./PhotoSortingUi";

export function PhotoSortingWorkspaceShell({
  children,
  embedded,
  modal,
  step,
  stepLabels,
  photoMode,
  studioSubMode,
  department,
  gapMinutes,
  rootFolderName,
}: {
  children: ReactNode;
  embedded: boolean;
  modal: boolean;
  step: number;
  stepLabels: readonly string[];
  photoMode: PhotoShootingMode;
  studioSubMode: StudioSubMode;
  department: MedicalDepartment;
  gapMinutes: number;
  rootFolderName: string;
}) {
  return (
    <>
      {step > 0 ? (
        <div
          className="ps-mode-badge"
          style={{
            background: photoMode === "studio" ? "#F5F0FF" : C.light,
            color: photoMode === "studio" ? C.purple : C.teal,
            borderBottom: `1px solid ${photoMode === "studio" ? "#DDD6FE" : C.border}`,
          }}
        >
          {photoMode === "studio"
            ? (studioSubMode === "group" ? "스튜디오 · 여러명 모드" : "스튜디오 · 한명 모드")
            : `현장촬영 — ${DEPARTMENT_DISPLAY[department]} — ${gapMinutes}분`}
        </div>
      ) : null}

      <section
        className="photo-sorting-surface"
        data-photo-sorting-surface={embedded ? "workspace" : "standalone"}
        style={{
          background: embedded ? "#2A2A2A" : C.bg,
          minHeight: modal || embedded ? undefined : "100vh",
          color: embedded ? "rgba(255,255,255,.88)" : C.txt,
          paddingBottom: embedded ? 24 : 0,
        }}
      >
        {embedded ? <EmbeddedWorkspaceStyles /> : null}
        {embedded ? <EmbeddedWorkspaceHeader rootFolderName={rootFolderName} /> : null}
        <Stepper
          items={stepLabels.map((label, index) => ({ id: `${photoMode}-${index}`, label }))}
          activeIndex={Math.max(0, Math.min(step, stepLabels.length - 1))}
          ariaLabel="사진 분류 진행 단계"
        />
        <div className="ps-wrap" style={{ maxWidth: 960, margin: "0 auto" }}>
          {children}
        </div>
        {embedded ? (
          <footer style={{ minHeight: 70, display: "flex", alignItems: "center", padding: "0 20px", borderTop: "1px solid rgba(255,255,255,.10)", color: "rgba(255,255,255,.48)", fontSize: 11 }}>
            {step === 0 ? "작업 폴더와 분류 기준을 선택하세요." : "분류 결과를 확인하고 다음 단계를 진행하세요."}
          </footer>
        ) : null}
      </section>
    </>
  );
}

function EmbeddedWorkspaceHeader({ rootFolderName }: { rootFolderName: string }) {
  return (
    <header style={{ minHeight: 70, display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.10)" }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "rgba(79,216,184,.12)", color: "#4FD8B8", flexShrink: 0 }}>
        <FolderTree size={18} strokeWidth={1.8} />
      </span>
      <span style={{ minWidth: 0 }}>
        <strong style={{ display: "block", fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,.88)" }}>사진 분류</strong>
        <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "rgba(255,255,255,.52)" }}>사진을 분석해 장면별 폴더 구조로 정리합니다.</span>
      </span>
      <span style={{ marginLeft: "auto", maxWidth: "42%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,.13)", borderRadius: 999, padding: "7px 10px", color: "rgba(255,255,255,.65)", fontSize: 11 }}>
        현재 작업 폴더: <strong style={{ color: "rgba(255,255,255,.88)", fontWeight: 500 }}>{rootFolderName || "선택 안 됨"}</strong>
      </span>
    </header>
  );
}

function EmbeddedWorkspaceStyles() {
  return <style>{`
    [data-photo-sorting-surface="workspace"] select,
    [data-photo-sorting-surface="workspace"] textarea,
    [data-photo-sorting-surface="workspace"] input:not([type="checkbox"]):not([type="radio"]) {
      background: rgba(0,0,0,.16) !important;
      border-color: rgba(255,255,255,.15) !important;
      color: rgba(255,255,255,.88) !important;
      color-scheme: dark;
    }
    [data-photo-sorting-surface="workspace"] select:focus,
    [data-photo-sorting-surface="workspace"] textarea:focus,
    [data-photo-sorting-surface="workspace"] input:focus {
      border-color: #4FD8B8 !important;
      box-shadow: 0 0 0 3px rgba(79,216,184,.10);
      outline: none;
    }
    @container (max-width: 700px) {
      [data-photo-sorting-surface="workspace"] .pc-mobile-form-grid,
      [data-photo-sorting-surface="workspace"] .pc-ai-auto-grid,
      [data-photo-sorting-surface="workspace"] .ps-stat4 {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      [data-photo-sorting-surface="workspace"] .ps-btn-row {
        align-items: stretch !important;
        flex-direction: column !important;
      }
      [data-photo-sorting-surface="workspace"] .ps-wrap {
        width: 100%;
        max-width: none !important;
        padding-inline: 12px;
      }
      [data-photo-sorting-surface="workspace"] > header > span:last-child {
        display: none !important;
      }
    }
  `}</style>;
}
