import {
  scanBridgeFolder,
  type BridgeFolderScan,
} from "@/lib/photo-bridge/bridgeFiles";
import {
  bridgeFolderMarksByName,
  readBridgeFolderMarks,
  readBridgeFolderSelectionSource,
  remoteBridgeThumbnailsToJpgs,
} from "@/lib/photo-bridge/folderSession";
import {
  loadRemoteBridgeThumbnails,
  type RemoteBridgeThumbnailPage,
  type RemoteBridgeThumbnailResult,
} from "@/lib/photo-bridge/remoteThumbnails";
import type { BridgeFolderTrailItem } from "@/lib/photo-bridge/recentFolder";
import type { BridgeSelectionSource } from "@/lib/photo-bridge/toolLinkage";
import type { RemoteNasSelection } from "@/lib/remote-nas/types";

type StorageReader = Pick<Storage, "getItem">;

type BridgeFolderScanner = (
  directory: FileSystemDirectoryHandle,
  folderPath: string,
  options: { includeNestedJpgs: boolean; maxDepth: number },
) => Promise<BridgeFolderScan>;

type RemoteThumbnailLoader = (
  folderPath: string,
  options?: { onPage?: (page: RemoteBridgeThumbnailPage) => void },
) => Promise<RemoteBridgeThumbnailResult>;

export type RemoteBridgeFolderProgress = {
  jpgs: BridgeFolderScan["jpgs"];
  received: number;
  total: number;
};

export async function loadLocalBridgeFolderSnapshot({
  directory,
  trail,
  includeNestedJpgs,
  storage,
  scanFolder = scanBridgeFolder,
}: {
  directory: FileSystemDirectoryHandle;
  trail: readonly BridgeFolderTrailItem[];
  includeNestedJpgs: boolean;
  storage: StorageReader;
  scanFolder?: BridgeFolderScanner;
}) {
  const folderPath = trail.map((item) => item.name).join(" / ");
  const selectionSourceKey = trail.map((item) => item.name).join("/");
  const selectionSource = readBridgeFolderSelectionSource(storage, selectionSourceKey);
  const scan = await scanFolder(directory, folderPath, {
    includeNestedJpgs,
    maxDepth: 5,
  });
  const marks = readBridgeFolderMarks(storage, folderPath);

  return {
    folderPath,
    selectionSource,
    scan,
    marks,
    marksByName: bridgeFolderMarksByName(scan.jpgs, marks.ratings, marks.colorLabels),
  };
}

export async function loadRemoteBridgeFolderSnapshot({
  selection,
  storage,
  selectionSource: suppliedSelectionSource,
  loadThumbnails = loadRemoteBridgeThumbnails,
  onProgress,
}: {
  selection: RemoteNasSelection;
  storage: StorageReader;
  selectionSource?: BridgeSelectionSource;
  loadThumbnails?: RemoteThumbnailLoader;
  onProgress?: (progress: RemoteBridgeFolderProgress) => void;
}) {
  const selectionSource = suppliedSelectionSource
    ?? readBridgeFolderSelectionSource(storage, selection.path);
  const progressiveJpgs: BridgeFolderScan["jpgs"] = [];
  const result = await loadThumbnails(selection.path, {
    onPage: (page) => {
      progressiveJpgs.push(...remoteBridgeThumbnailsToJpgs(selection.path, page.thumbs));
      onProgress?.({
        jpgs: [...progressiveJpgs],
        received: page.received,
        total: page.total,
      });
    },
  });
  return {
    selectionSource,
    jpgs: progressiveJpgs.length === result.thumbs.length
      ? progressiveJpgs
      : remoteBridgeThumbnailsToJpgs(selection.path, result.thumbs),
    total: result.total,
  };
}
