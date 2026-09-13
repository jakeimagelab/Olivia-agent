import {
  joinRemoteNasPath,
  normalizeRemoteNasRelativePath,
  sortRemoteNasEntries,
  toRemoteNasDisplayName,
  toRemoteNasDisplayPath,
} from "./path";
import {
  REMOTE_NAS_ROOT_NAME,
  type ListRemoteNasFolderOptions,
  type RemoteNasDataSource,
  type RemoteNasEntry,
  type RemoteNasEntryKind,
  type RemoteNasFolderResult,
} from "./types";

type MockNode = {
  kind: RemoteNasEntryKind;
  name: string;
  sizeBytes?: number;
  modifiedAt?: string;
  mimeType?: string;
};

const nfdJpgName = "진료실_현장_0001.JPG".normalize("NFD");

const MOCK_TREE: Readonly<Record<string, readonly MockNode[]>> = {
  "": [
    { kind: "directory", name: "0623_라셀의원", modifiedAt: "2026-06-24T10:18:00+09:00" },
    { kind: "directory", name: "0702_페이버요양병원", modifiedAt: "2026-07-03T09:44:00+09:00" },
    { kind: "directory", name: "0714_브랜딩더코어", modifiedAt: "2026-07-15T16:11:00+09:00" },
    { kind: "directory", name: "0811_세무사회", modifiedAt: "2026-08-12T13:06:00+09:00" },
    { kind: "directory", name: "0819_진보형교수님", modifiedAt: "2026-08-21T20:35:00+09:00" },
    { kind: "directory", name: "0825_제주관광공사", modifiedAt: "2026-08-27T08:50:00+09:00" },
    { kind: "directory", name: "0907_더힐피부과", modifiedAt: "2026-09-08T23:14:00+09:00" },
    { kind: "directory", name: "0911_WINF", modifiedAt: "2026-09-12T01:28:00+09:00" },
    { kind: "directory", name: "AI", modifiedAt: "2026-09-12T18:02:00+09:00" },
  ],
  "0623_라셀의원": [],
  "0702_페이버요양병원": [],
  "0714_브랜딩더코어": [],
  "0811_세무사회": [],
  "0819_진보형교수님": [
    { kind: "directory", name: "RAW", modifiedAt: "2026-08-21T20:32:00+09:00" },
    { kind: "directory", name: "JPG", modifiedAt: "2026-08-21T20:34:00+09:00" },
    { kind: "directory", name: "SELECT", modifiedAt: "2026-08-22T09:11:00+09:00" },
    { kind: "directory", name: "REPORT", modifiedAt: "2026-08-22T09:20:00+09:00" },
    { kind: "file", name: "촬영_메모.txt", sizeBytes: 12_842, modifiedAt: "2026-08-19T08:30:00+09:00", mimeType: "text/plain" },
    { kind: "file", name: "대표컷_0001.JPG", sizeBytes: 8_934_145, modifiedAt: "2026-08-21T20:30:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/RAW": [
    { kind: "file", name: "DSC_8101.CR2", sizeBytes: 42_814_490, modifiedAt: "2026-08-19T10:14:22+09:00", mimeType: "image/x-canon-cr2" },
    { kind: "file", name: "DSC_8102.CR2", sizeBytes: 43_102_221, modifiedAt: "2026-08-19T10:14:27+09:00", mimeType: "image/x-canon-cr2" },
    { kind: "file", name: "DSC_8103.CR2", sizeBytes: 41_997_008, modifiedAt: "2026-08-19T10:14:33+09:00", mimeType: "image/x-canon-cr2" },
  ],
  "0819_진보형교수님/JPG": [
    { kind: "directory", name: "PREVIEW", modifiedAt: "2026-08-21T19:45:00+09:00" },
    { kind: "file", name: nfdJpgName, sizeBytes: 7_420_116, modifiedAt: "2026-08-19T10:14:22+09:00", mimeType: "image/jpeg" },
    { kind: "file", name: "원장프로필_0002.JPG", sizeBytes: 8_151_503, modifiedAt: "2026-08-19T11:02:08+09:00", mimeType: "image/jpeg" },
    { kind: "file", name: "상담장면_0003.JPG", sizeBytes: 7_882_046, modifiedAt: "2026-08-19T11:18:51+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/JPG/PREVIEW": [
    { kind: "file", name: "contact-sheet.jpg", sizeBytes: 1_946_228, modifiedAt: "2026-08-21T19:44:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/SELECT": [
    { kind: "file", name: "원장프로필_A.JPG", sizeBytes: 8_045_220, modifiedAt: "2026-08-22T09:08:00+09:00", mimeType: "image/jpeg" },
  ],
  "0819_진보형교수님/REPORT": [
    { kind: "file", name: "selection-report.json", sizeBytes: 84_208, modifiedAt: "2026-08-22T09:20:00+09:00", mimeType: "application/json" },
  ],
  "0825_제주관광공사": [],
  "0907_더힐피부과": [],
  "0911_WINF": [],
  "AI": [],
};

function toEntry(parentPath: string, node: MockNode): RemoteNasEntry {
  const path = joinRemoteNasPath(parentPath, node.name);
  return {
    kind: node.kind,
    name: node.name,
    path,
    displayName: toRemoteNasDisplayName(node.name),
    displayPath: toRemoteNasDisplayPath(path),
    sizeBytes: node.kind === "file" ? node.sizeBytes ?? 0 : null,
    modifiedAt: node.modifiedAt ?? null,
    mimeType: node.mimeType ?? null,
  };
}

function waitForMock(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("요청이 취소되었습니다.", "AbortError"));
    }, { once: true });
  });
}

export function createMockRemoteNasDataSource(options: { delayMs?: number } = {}): RemoteNasDataSource {
  const delayMs = options.delayMs ?? 90;

  return {
    async listFolder(relativePath: string, requestOptions?: ListRemoteNasFolderOptions): Promise<RemoteNasFolderResult> {
      const path = normalizeRemoteNasRelativePath(relativePath);
      await waitForMock(delayMs, requestOptions?.signal);

      const nodes = MOCK_TREE[path];
      if (!nodes) throw new Error("해당 폴더를 찾을 수 없습니다.");

      return {
        rootName: REMOTE_NAS_ROOT_NAME,
        path,
        displayPath: toRemoteNasDisplayPath(path),
        entries: sortRemoteNasEntries(nodes.map((node) => toEntry(path, node))),
        connection: { macStudio: "online", nas: "connected", source: "mock" },
        readOnly: true,
      };
    },
  };
}

export const mockRemoteNasDataSource = createMockRemoteNasDataSource();
