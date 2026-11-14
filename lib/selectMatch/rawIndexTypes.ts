export interface SelectMatchPreflight {
  rawFound: number;
  willMatch: number;
  willMiss: number;
  rawSamples: string[];
  jpgSamples: string[];
}

// fileHandle만으로는 원본을 지울 수 없다(File System Access API에 "부모 폴더 알아내기"가
// 없음) — RAW 매칭 후 "이동" 선택지를 지원하려면 removeEntry를 부를 부모 dirHandle을 스캔
// 시점에 같이 들고 있어야 한다.
export interface RawIndexEntry {
  fileHandle: FileSystemFileHandle;
  dirHandle: FileSystemDirectoryHandle;
  relativePath: string;
}

export type RawIndex = Map<string, RawIndexEntry[]>;

export type BuildRawIndexOptions = {
  /** 자동 RAW 폴더 탐색의 표본 확인처럼 한 후보만 있으면 되는 경우에만 사용한다. */
  stopAfterFirstPerTarget?: boolean;
  /** 자동 탐색에서는 촬영 폴더 전체를 훑지 않도록 깊이를 제한한다. */
  maxDepth?: number;
  signal?: AbortSignal;
};
