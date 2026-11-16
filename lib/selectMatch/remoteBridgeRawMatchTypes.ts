import type { RemoteRawMatchRootLocator } from "@/lib/selectMatch/remoteRawMatchTypes";

export type RemoteBridgeRawMatchJpg = {
  name: string;
  relativePath: string;
  size: number;
  captureTimeMs: number | null;
};

export type RemoteBridgeRawMatchPayload = {
  projectRoot: RemoteRawMatchRootLocator;
  /** NAS Bridge에서는 JPG 이동 기준 경로, 로컬 셀렉→NAS RAW 모드에서는 생략한다. */
  currentJpgDirectory?: string;
  selectedJpgs: RemoteBridgeRawMatchJpg[];
  deliveredFolderName?: string;
  /** false면 RAW만 Selected_RAW에 복사하고 JPG/XMP는 건드리지 않는다. */
  moveJpgs?: boolean;
  openOutput?: boolean;
};

export type RemoteBridgeRawMatchFailure = {
  stage: "match" | "raw_copy" | "jpg_move" | "xmp_move";
  fileName: string;
  error: string;
};

export type RemoteBridgeRawMatchResult = {
  ok: true;
  status: "PHOTO_BRIDGE_RAW_MATCH_COMPLETED";
  selected: number;
  confirmed: number;
  copied: number;
  alreadyCopied: number;
  jpgMoved: number;
  xmpMoved: number;
  needsReview: number;
  failed: number;
  outputDir: string;
  deliveredDir: string;
  failures: RemoteBridgeRawMatchFailure[];
};
