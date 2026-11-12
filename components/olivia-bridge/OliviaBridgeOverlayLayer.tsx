"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, RefObject } from "react";
import { LoaderCircle } from "lucide-react";

import { BridgeFloatingWindow } from "@/components/olivia-bridge/BridgeFloatingWindow";
import {
  BridgeFullscreenPreview,
  BridgeSelectionReview,
} from "@/components/olivia-bridge/OliviaBridgeMedia";
import type { BridgeToolItem } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import { OliviaBridgeSceneReviewContent } from "@/components/olivia-bridge/OliviaBridgeSceneReviewContent";
import {
  BridgeFolderSourceDialog,
  BridgeGallerySelectionDialog,
  BridgePersonSelectionDialog,
  BridgeRawRootPromptDialog,
} from "@/components/olivia-bridge/OliviaBridgeDialogs";
import type { PhotoWorkspaceEmbeddedToolProps } from "@/components/photo-workspace/PhotoWorkspace";
import type { BridgeFloatingWindowRect } from "@/lib/photo-bridge/floatingWindow";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";
import styles from "./OliviaBridgeWorkspace.module.css";

const EmbeddedPhotoTool = dynamic(
  () => import("@/components/photo-workspace/PhotoWorkspace").then((module) => module.PhotoWorkspaceEmbeddedTool),
  {
    ssr: false,
    loading: () => <div className={styles.toolLoading}><LoaderCircle size={18} /> 기존 사진 도구를 여는 중...</div>,
  },
);

const PhotoSourcePicker = dynamic(
  () => import("@/components/photo-classifier/PhotoSourcePicker"),
  { ssr: false },
);

type SceneReviewWindow = {
  subtitle: string;
  rect?: BridgeFloatingWindowRect;
  onRectChange: (rect: BridgeFloatingWindowRect) => void;
  onClose: () => void;
  content: ComponentProps<typeof OliviaBridgeSceneReviewContent>;
};

type ToolWindow = {
  tool: BridgeToolItem;
  activeFolderName: string;
  selectedCount: number;
  rect?: BridgeFloatingWindowRect;
  onRectChange: (rect: BridgeFloatingWindowRect) => void;
  onClose: () => void;
  embeddedTool: Omit<PhotoWorkspaceEmbeddedToolProps, "mode" | "selectMode" | "fileOpsMode">;
};

export function OliviaBridgeOverlayLayer({
  containerRef,
  sceneReview,
  toolWindow,
  selectionReview,
  fullscreenPreview,
  folderSourceDialog,
  gallerySelectionDialog,
  personSelectionDialog,
  rawRootPromptDialog,
  nasPicker,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  sceneReview: SceneReviewWindow | null;
  toolWindow: ToolWindow | null;
  selectionReview: ComponentProps<typeof BridgeSelectionReview> | null;
  fullscreenPreview: ComponentProps<typeof BridgeFullscreenPreview> | null;
  folderSourceDialog: ComponentProps<typeof BridgeFolderSourceDialog> | null;
  gallerySelectionDialog: ComponentProps<typeof BridgeGallerySelectionDialog> | null;
  personSelectionDialog: ComponentProps<typeof BridgePersonSelectionDialog> | null;
  rawRootPromptDialog: ComponentProps<typeof BridgeRawRootPromptDialog> | null;
  nasPicker: {
    onCancel: () => void;
    onSelectRemote: (selection: RemoteNasSelection) => void;
  } | null;
}) {
  return <>
    {sceneReview ? <BridgeFloatingWindow
      windowId="scene-review"
      variant="scene"
      title="AI Scene 분류 검토"
      subtitle={sceneReview.subtitle}
      ariaLabel="AI Scene 분류 검토"
      containerRef={containerRef}
      rect={sceneReview.rect}
      onRectChange={sceneReview.onRectChange}
      onClose={sceneReview.onClose}
    >
      <OliviaBridgeSceneReviewContent {...sceneReview.content} />
    </BridgeFloatingWindow> : null}

    {toolWindow ? <BridgeFloatingWindow
      key={toolWindow.tool.key}
      windowId={`tool-${toolWindow.tool.key}`}
      variant="tool"
      title={toolWindow.tool.label}
      subtitle={`${toolWindow.activeFolderName} · 선택 JPG ${toolWindow.selectedCount}장`}
      ariaLabel={`${toolWindow.tool.label} 도구`}
      containerRef={containerRef}
      rect={toolWindow.rect}
      onRectChange={toolWindow.onRectChange}
      onClose={toolWindow.onClose}
    >
      <div className={styles.toolBody}>
        <EmbeddedPhotoTool
          mode={toolWindow.tool.mode}
          selectMode={toolWindow.tool.selectMode}
          fileOpsMode={toolWindow.tool.fileOpsMode}
          {...toolWindow.embeddedTool}
        />
      </div>
    </BridgeFloatingWindow> : null}

    {selectionReview ? <BridgeSelectionReview {...selectionReview} /> : null}
    {fullscreenPreview ? <BridgeFullscreenPreview {...fullscreenPreview} /> : null}
    {folderSourceDialog ? <BridgeFolderSourceDialog {...folderSourceDialog} /> : null}
    {gallerySelectionDialog ? <BridgeGallerySelectionDialog {...gallerySelectionDialog} /> : null}
    {personSelectionDialog ? <BridgePersonSelectionDialog {...personSelectionDialog} /> : null}
    {rawRootPromptDialog ? <BridgeRawRootPromptDialog {...rawRootPromptDialog} /> : null}
    {nasPicker ? <PhotoSourcePicker sourceScope="person-select" {...nasPicker} /> : null}
  </>;
}
