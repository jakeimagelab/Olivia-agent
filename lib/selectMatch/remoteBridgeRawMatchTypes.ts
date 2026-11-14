import type { RemoteRawMatchRootLocator } from "@/lib/selectMatch/remoteRawMatchTypes";

export type RemoteBridgeRawMatchJpg = {
  name: string;
  relativePath: string;
  size: number;
  captureTimeMs: number | null;
};

export type RemoteBridgeRawMatchPayload = {
  projectRoot: RemoteRawMatchRootLocator;
  currentJpgDirectory: string;
  selectedJpgs: RemoteBridgeRawMatchJpg[];
  deliveredFolderName: string;
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
