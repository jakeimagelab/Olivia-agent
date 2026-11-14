import type { CaptureTime } from "@/lib/selectMatch/captureTime";
import type { RawIndexEntry } from "@/lib/selectMatch/rawIndex";

export type CaptureMatchStatus = "confirmed" | "time_mismatch" | "multiple_candidates" | "missing_time" | "raw_missing";

export type JpgMatchSource = {
  id: string;
  name: string;
  basename: string;
  relativePath: string;
  handle: FileSystemFileHandle;
  thumbUrl: string | null;
};

export type RawMatchCandidate = {
  id: string;
  entry: RawIndexEntry;
  captureTime: CaptureTime | null;
  fileSize: number;
  differenceMs: number | null;
};

export type CaptureMatchDecision = {
  id: string;
  jpg: JpgMatchSource;
  jpgCaptureTime: CaptureTime | null;
  candidates: RawMatchCandidate[];
  status: CaptureMatchStatus;
  confirmedCandidateId: string | null;
};

export type CaptureMatchPreflight = {
  items: CaptureMatchDecision[];
  rawFound: number;
  confirmed: number;
  timeMismatch: number;
  multipleCandidates: number;
  missingTime: number;
  rawMissing: number;
};

export type MatchLogResult = "확정" | "수동선택" | "건너뜀";

export type MatchLogRow = {
  jpgName: string;
  jpgPath: string;
  jpgCaptureTime: CaptureTime | null;
  rawPath: string;
  rawCaptureTime: CaptureTime | null;
  rawCaptureTimeText?: string;
  result: MatchLogResult;
};
