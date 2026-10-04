"use client";

import { usePathname } from "next/navigation";
import GlobalHeader from "@/components/GlobalHeader";
import PhotoStudioExecutionBar from "@/components/photo-workspace/PhotoStudioExecutionBar";
import { PhotoStudioExecutionProvider, usePhotoStudioExecution } from "@/components/photo-workspace/PhotoStudioExecutionContext";
import RemoteUnsupportedNotice from "@/components/photo-workspace/RemoteUnsupportedNotice";

const TITLE: Record<string, { title: string; description: string }> = {
  "/photo-sorting":    { title: "사진 분류",         description: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다." },
  "/photo-retouching": { title: "사진 보정",         description: "사진을 업로드해 AI로 피부톤 또는 가운 색을 기준과 비교하고 Photoshop·Camera Raw 보정값을 제공합니다." },
  "/raw-select":       { title: "T컷 정리",          description: "JPG 실패컷 후보를 확인한 뒤 Trash_JPG로 안전하게 이동합니다." },
  "/select-match":     { title: "RAW 매칭",          description: "선택된 JPG와 대응하는 RAW 원본을 매칭해 복사하거나 이동합니다." },
};

const MESH_BG = "#f0f4f2";

function PhotoStudioRouteContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { executionMode } = usePhotoStudioExecution();
  if (executionMode === "REMOTE_WORKER" && pathname !== "/photo-sorting") {
    const feature = TITLE[pathname]?.title ?? "이 기능";
    return <RemoteUnsupportedNotice feature={feature} />;
  }
  return <>{children}</>;
}

export default function PhotoStudioLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unifiedWorkspace = pathname === "/photo-sorting";
  const meta = TITLE[pathname] ?? { title: "사진 작업실", description: "사진 분류·색감 체크·피부톤 DNA 비교·Photoshop 보정 가이드를 한 화면에서 관리합니다." };

  return (
    <PhotoStudioExecutionProvider>
      <div style={{ minHeight: "100vh", background: MESH_BG, fontFamily: "var(--font-sans)" }}>
        {!unifiedWorkspace ? <GlobalHeader title={meta.title} description={meta.description} /> : null}

        <PhotoStudioExecutionBar />
        <div className={unifiedWorkspace ? undefined : "pc-page-content"}>
          <PhotoStudioRouteContent>{children}</PhotoStudioRouteContent>
        </div>
      </div>
    </PhotoStudioExecutionProvider>
  );
}
