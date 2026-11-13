import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

import type { BridgeToolKey } from "@/components/olivia-bridge/OliviaBridgeActionBar";
import type { BridgeWorkspaceFileFilter } from "@/components/olivia-bridge/OliviaBridgeFolderPanel";
import type { ExecutionMode } from "@/lib/photo-classifier/photoSource";
import type { BridgeFolderScan } from "@/lib/photo-bridge/bridgeFiles";
import type {
  BridgeColorLabels,
  BridgeRatingEdits,
} from "@/lib/photo-bridge/labels";
import type {
  BridgeFolderTrailItem,
  BridgeRawFolderCandidate,
} from "@/lib/photo-bridge/recentFolder";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

export type BridgePreviewSize = { width: number; height: number } | undefined;
export type BridgeScanStatus = "idle" | "restoring" | "loading" | "ready" | "error";
export type BridgeRemoteLoadProgress = { received: number; total: number } | null;

export type OliviaBridgeFolderLoadingBindings = {
  includeNestedJpgs: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  setRemoteLoadProgress: Dispatch<SetStateAction<BridgeRemoteLoadProgress>>;
  setExecutionMode: (mode: ExecutionMode) => void;
  setScanStatus: Dispatch<SetStateAction<BridgeScanStatus>>;
  setScanError: Dispatch<SetStateAction<string | undefined>>;
  setToolKey: Dispatch<SetStateAction<BridgeToolKey | undefined>>;
  setSceneReviewOpen: Dispatch<SetStateAction<boolean>>;
  resetSelectionState: (source: BridgeSelectionSource) => void;
  setRatings: Dispatch<SetStateAction<Record<string, number>>>;
  setRatingEdits: Dispatch<SetStateAction<BridgeRatingEdits>>;
  setColorLabels: Dispatch<SetStateAction<BridgeColorLabels>>;
  setExcludedIds: Dispatch<SetStateAction<Set<string>>>;
  setScan: Dispatch<SetStateAction<BridgeFolderScan>>;
  setRemoteFolder: Dispatch<SetStateAction<RemoteNasSelection | null>>;
  setBreadcrumbs: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRestoreTrail: Dispatch<SetStateAction<BridgeFolderTrailItem[]>>;
  setRestoreMessage: Dispatch<SetStateAction<string>>;
  resetAdobeMarks: () => void;
  setAnchorId: Dispatch<SetStateAction<string | null>>;
  setFocusedId: Dispatch<SetStateAction<string | null>>;
  setPreviewSize: Dispatch<SetStateAction<BridgePreviewSize>>;
  setFileFilter: Dispatch<SetStateAction<BridgeWorkspaceFileFilter>>;
  setCurrentLocalFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRawMatchFolderPath: (path: string) => void;
  setRawMatchDefaultFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setRawMatchFolderCandidates: (folders: readonly BridgeRawFolderCandidate[]) => void;
  setJpgRatingsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  setJpgColorLabelsByName: (
    entries: Readonly<Record<string, number | null | undefined>>,
    options?: { overwrite?: boolean },
  ) => void;
  rememberPublishedRatings: (ratings: Readonly<Record<string, number>>) => void;
};
