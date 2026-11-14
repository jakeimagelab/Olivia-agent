import type { PersonSelectRawColorLabel } from "@/lib/person-select/rawMatch";

export type AdobeBridgeMark = {
  rating: number | null;
  colorLabel: PersonSelectRawColorLabel | null;
};

export type AdobeBridgeRatingCandidate = {
  name: string;
  file?: File;
  handle?: FileSystemFileHandle;
  relativeDirectory?: string;
  parentHandle?: FileSystemDirectoryHandle;
};

export type AdobeBridgeMarksProgress = {
  read: number;
  total: number;
  rated: number;
  colored: number;
  failed: number;
};

export type AdobeBridgeMarksResult = AdobeBridgeMarksProgress & {
  marks: Map<string, AdobeBridgeMark>;
  failedFileNames: string[];
  firstError: string | null;
};
