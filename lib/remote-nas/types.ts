export const REMOTE_NAS_ROOT_NAME = "Workstation(M.2SSD)";

export type RemoteNasEntryKind = "directory" | "file";

export type RemoteNasEntry = {
  kind: RemoteNasEntryKind;
  /** Mac Studio가 반환한 원본 이름. Worker 요청에 다시 사용할 때 정규화하지 않는다. */
  name: string;
  /** NAS root 기준 원본 상대 경로. */
  path: string;
  /** 화면 표시 전용 NFC 이름. */
  displayName: string;
  /** 화면 표시 전용 NFC 상대 경로. */
  displayPath: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  mimeType?: string | null;
};

export type RemoteNasConnectionState = {
  macStudio: "online" | "offline" | "unknown";
  nas: "connected" | "disconnected" | "unknown";
  source: "mock" | "worker";
};

export type RemoteNasFolderResult = {
  rootName: typeof REMOTE_NAS_ROOT_NAME;
  path: string;
  displayPath: string;
  entries: RemoteNasEntry[];
  connection: RemoteNasConnectionState;
  readOnly: true;
};

export type ListRemoteNasFolderOptions = {
  signal?: AbortSignal;
};

/** UI가 의존하는 유일한 조회 계약. 후속 LIST_FOLDER adapter가 이 인터페이스를 구현한다. */
export interface RemoteNasDataSource {
  listFolder(
    relativePath: string,
    options?: ListRemoteNasFolderOptions,
  ): Promise<RemoteNasFolderResult>;
}

export type RemoteNasSelection = {
  /** Worker에 전달할 원본 상대 경로. Root는 빈 문자열이다. */
  path: string;
  /** 사용자에게 보여줄 NFC 경로. */
  displayPath: string;
  rootName: typeof REMOTE_NAS_ROOT_NAME;
};
