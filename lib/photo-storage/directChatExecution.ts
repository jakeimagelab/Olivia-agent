import type { OliviaAgentToolExecution, OliviaContextSnapshot, OliviaToolVerification } from "@/lib/olivia/v2/types";

export type PhotoDirectOperation = "source_prep" | "scene_sort";
export type PhotoDirectPendingStage = "choose_folder" | "folder_retry" | "scene_settings" | "restart_confirmation";

export type PhotoDirectFolderCandidate = {
  displayName: string;
  sourceRelativePath: string;
  fileCount: number;
  jpgCount: number;
  jpgBytes: number;
  rawCount: number;
  totalBytes: number;
  modifiedAt: string | null;
  projectStatus: string;
};

export type PhotoDirectWorkItem = {
  query: string;
  selectedFolder?: string;
  selectedDisplayName?: string;
  candidates?: PhotoDirectFolderCandidate[];
  confirmRestart?: boolean;
};

export type PhotoDirectPendingState = {
  version: 1;
  operation: PhotoDirectOperation;
  stage: PhotoDirectPendingStage;
  items: PhotoDirectWorkItem[];
  currentIndex: number;
  completedReports: string[];
  department?: string;
  shootingMode?: "field" | "studio";
  createdAt: string;
};

export type PhotoDirectToolCallRecord = {
  id: string;
  name: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  code?: string;
  verification?: OliviaToolVerification;
};

export type PhotoDirectExecutionResult = {
  handled: boolean;
  text?: string;
  pendingState?: PhotoDirectPendingState | null;
  toolCalls: PhotoDirectToolCallRecord[];
  reason: "disabled" | "no_intent" | "hermes_already_called" | "needs_input" | "executed" | "cancelled";
};

type ExecuteTool = (
  name: string,
  input: Record<string, unknown>,
  context: OliviaContextSnapshot,
) => Promise<{ id: string; execution: OliviaAgentToolExecution }>;

const SOURCE_PREP_PATTERN = /(?:원본(?:을|를)?\s*(?:분리|분류)|raw\s*(?:[·/&+]|와|과)?\s*jpg(?:를|을)?\s*(?:로\s*)?분리|jpg(?:를|을)?\s*(?:로\s*)?(?:분리|통합)|1\s*차\s*분류)(?:\s*(?:해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?/i;
const SCENE_SORT_PATTERN = /(?:(?:씬|scene)(?:\s*별)?(?:로|을|를)?\s*분류|사진(?:을|를)?\s*분류|2\s*차\s*분류)(?:\s*(?:해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?/i;
const MULTI_FOLDER_SPLIT_PATTERN = /분리(?:\s*(?:해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?/i;
const PHOTO_TOOL_NAMES = new Set(["find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort"]);
const APPROVE_PATTERN = /^(?:응|네|예|그래|맞아|좋아|오케이|ok|ㅇㅇ|해\s*줘|진행해|다시\s*(?:해|시작해)|재시도)(?:[.!~\s]|$)/i;
const REJECT_PATTERN = /^(?:아니|아니야|취소|하지\s*마|안\s*할래|됐어|그만)(?:[.!~\s]|$)/i;

const DEPARTMENT_LABELS: Array<[RegExp, string]> = [
  [/정형외과\s*(?:\/|·|및|와|과)?\s*신경외과|신경외과\s*(?:\/|·|및|와|과)?\s*정형외과/i, "orthopedics_neurosurgery"],
  [/내과\s*(?:\/|·|및|와|과)?\s*검진센터|검진센터/i, "internal_medicine_checkup"],
  [/피부과/i, "dermatology"],
  [/치과/i, "dentistry"],
  [/안과/i, "ophthalmology"],
  [/정형외과|신경외과/i, "orthopedics_neurosurgery"],
  [/소아과/i, "pediatrics"],
  [/한의원|한방/i, "korean_medicine"],
  [/성형외과/i, "plastic_surgery"],
  [/산부인과/i, "obgyn"],
  [/내과/i, "internal_medicine_checkup"],
  [/기타|일반/i, "general"],
];

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function comparable(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function normalizeToolName(name: string): string {
  return name.replace(/^mcp_olivia_/, "").replaceAll(".", "_");
}

function parseOperation(message: string): { operation: PhotoDirectOperation; matchedText: string } | null {
  const source = message.match(SOURCE_PREP_PATTERN);
  const scene = message.match(SCENE_SORT_PATTERN);
  if (source && scene) return null;
  if (source) return { operation: "source_prep", matchedText: source[0] };
  if (scene) return { operation: "scene_sort", matchedText: scene[0] };
  // "르셀청담이랑 세무사회 두 개 분리해줘"처럼 대상이 명백히 여러 개인 축약 표현만 원본
  // 분리로 허용한다. 단일 "Scene을 분리해줘"를 JPG 통합으로 오인하면 실제 job이 생기므로,
  // 일반적인 '분리' 한 단어만으로는 절대 실행하지 않는다.
  const multiFolderSplit = message.match(MULTI_FOLDER_SPLIT_PATTERN);
  if (multiFolderSplit && /(?:두\s*(?:개|곳)|둘\s*다|이랑\s+|랑\s+|하고\s+|그리고\s+|,|와\s+|과\s+)/.test(message)) {
    return { operation: "source_prep", matchedText: multiFolderSplit[0] };
  }
  return null;
}

function cleanFolderQuery(value: string): string {
  return value
    .replace(/["'“”‘’]/g, " ")
    // "나스에서"의 흔한 오타인 "나스에스"까지 위치 표현으로 취급한다. 이 접두사가
    // 검색어에 남으면 실제 "0918_삼칠갈비" 폴더를 찾지 못한다.
    .replace(/(?:(?:\bnas\b|나스)(?:에서|에스|의|쪽)?|(?:\bwork\s*station\b|워크\s*스테이션)(?:에서|의|쪽)?)/gi, " ")
    .replace(/(?:촬영|백업)\s*폴더(?:를|을|에서|의)?/g, " ")
    .replace(/폴더(?:를|을|에서|의)?/g, " ")
    .replace(/(?:두|2)\s*(?:개|곳)(?:를|을|다|모두)?/g, " ")
    .replace(/(?:둘|전부)\s*다/g, " ")
    .replace(/(?:작업을?\s*)?(?:시작|실행|진행)(?:해\s*줘|해주세요|해줘|해)?/g, " ")
    .replace(/(?:부탁해|부탁해요|해주세요|해\s*줘|해줘)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(?:을|를|은|는)$/, "")
    .trim();
}

function splitFolderQueries(message: string, matchedText: string): string[] {
  const withoutIntent = message.replace(matchedText, " ");
  return withoutIntent
    .split(/\s*(?:,|그리고|이랑|랑|하고|와|과)\s+/)
    .map(cleanFolderQuery)
    .filter((value) => value.length >= 2);
}

function parseExplicitSceneSettings(message: string, allowBareDepartment: boolean): {
  department?: string;
  shootingMode?: "field" | "studio";
} {
  const field = /(?:현장|출장|로케이션)(?:\s*촬영)?|\bfield\b/i.test(message);
  const studio = /스튜디오(?:\s*촬영)?|\bstudio\b/i.test(message);
  const shootingMode = field === studio ? undefined : field ? "field" as const : "studio" as const;
  const departmentContext = allowBareDepartment
    || /진료과\s*(?:는|은|:)?\s*[가-힣_a-z/·\s]+/i.test(message)
    || (Boolean(shootingMode) && DEPARTMENT_LABELS.some(([pattern]) => pattern.test(message)));
  const department = departmentContext
    ? DEPARTMENT_LABELS.find(([pattern]) => pattern.test(message))?.[1]
    : undefined;
  return { department, shootingMode };
}

export function parsePhotoDirectCommand(message: string): {
  operation: PhotoDirectOperation;
  folderQueries: string[];
  department?: string;
  shootingMode?: "field" | "studio";
} | null {
  const parsed = parseOperation(message);
  if (!parsed) return null;
  const folderQueries = splitFolderQueries(message, parsed.matchedText);
  if (!folderQueries.length) return null;
  const settings = parsed.operation === "scene_sort"
    ? parseExplicitSceneSettings(message, false)
    : {};
  return { operation: parsed.operation, folderQueries, ...settings };
}

function candidateFromUnknown(value: unknown): PhotoDirectFolderCandidate | undefined {
  const raw = record(value);
  const displayName = string(raw?.displayName) ?? string(raw?.name);
  const sourceRelativePath = string(raw?.sourceRelativePath);
  if (!raw || !displayName || !sourceRelativePath) return undefined;
  return {
    displayName,
    sourceRelativePath,
    fileCount: finiteNumber(raw.fileCount),
    jpgCount: finiteNumber(raw.jpgCount),
    jpgBytes: finiteNumber(raw.jpgBytes),
    rawCount: finiteNumber(raw.rawCount),
    totalBytes: finiteNumber(raw.totalBytes),
    modifiedAt: string(raw.modifiedAt) ?? null,
    projectStatus: string(raw.projectStatus) ?? "UNREGISTERED",
  };
}

function candidatesFromResult(execution: OliviaAgentToolExecution): PhotoDirectFolderCandidate[] {
  const values = execution.result.data?.candidates;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const candidate = candidateFromUnknown(value);
    return candidate ? [candidate] : [];
  });
}

function itemFromUnknown(value: unknown): PhotoDirectWorkItem | undefined {
  const raw = record(value);
  const query = string(raw?.query);
  if (!raw || !query) return undefined;
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.flatMap((candidate) => {
      const parsed = candidateFromUnknown(candidate);
      return parsed ? [parsed] : [];
    })
    : undefined;
  return {
    query,
    ...(string(raw.selectedFolder) ? { selectedFolder: string(raw.selectedFolder) } : {}),
    ...(string(raw.selectedDisplayName) ? { selectedDisplayName: string(raw.selectedDisplayName) } : {}),
    ...(candidates?.length ? { candidates } : {}),
    ...(raw.confirmRestart === true ? { confirmRestart: true } : {}),
  };
}

export function readPendingPhotoDirectExecution(metadata: unknown): PhotoDirectPendingState | undefined {
  const raw = record(record(metadata)?.pendingPhotoDirectExecution);
  if (!raw || raw.version !== 1 || (raw.operation !== "source_prep" && raw.operation !== "scene_sort")) return undefined;
  if (!(["choose_folder", "folder_retry", "scene_settings", "restart_confirmation"] as unknown[]).includes(raw.stage)) return undefined;
  if (!Array.isArray(raw.items)) return undefined;
  const items = raw.items.flatMap((item) => {
    const parsed = itemFromUnknown(item);
    return parsed ? [parsed] : [];
  });
  const currentIndex = finiteNumber(raw.currentIndex);
  if (!items.length || currentIndex < 0 || currentIndex >= items.length) return undefined;
  return {
    version: 1,
    operation: raw.operation,
    stage: raw.stage as PhotoDirectPendingStage,
    items,
    currentIndex,
    completedReports: Array.isArray(raw.completedReports) ? raw.completedReports.filter((value): value is string => typeof value === "string") : [],
    ...(string(raw.department) ? { department: string(raw.department) } : {}),
    ...(raw.shootingMode === "field" || raw.shootingMode === "studio" ? { shootingMode: raw.shootingMode } : {}),
    createdAt: string(raw.createdAt) ?? new Date(0).toISOString(),
  };
}

function selectedCandidate(message: string, candidates: PhotoDirectFolderCandidate[]): PhotoDirectFolderCandidate | undefined {
  const ordinal = message.trim().match(/^(\d{1,2})\s*(?:번|번째)?(?:으로|로)?(?:\s*(?:해|선택|진행).*)?$/);
  if (ordinal) return candidates[Number(ordinal[1]) - 1];
  const normalized = comparable(message.replace(/(?:으로|로)?\s*(?:해\s*줘|해주세요|진행해|선택해).*$/i, ""));
  return candidates.find((candidate) => {
    return comparable(candidate.displayName) === normalized || comparable(candidate.sourceRelativePath) === normalized;
  });
}

function folderCorrection(message: string): string | undefined {
  const explicitlyNamed = /^(?:정확한\s*)?폴더명(?:은|는|이|가|:)?\s*/.test(message.trim());
  const cleaned = message
    .replace(/["'“”‘’]/g, " ")
    .replace(/^(?:정확한\s*)?폴더명(?:은|는|이|가|:)?\s*/, "")
    .replace(/(?:이야|야|입니다|이에요|예요|맞아|맞아요)[.!~\s]*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2 || cleaned.length > 120) return undefined;
  if (APPROVE_PATTERN.test(cleaned) || REJECT_PATTERN.test(cleaned)) return undefined;
  // 검색 실패 직후라도 일반 대화를 폴더명으로 오인하지 않는다. 명시적인 "폴더명" 표현,
  // 촬영일 숫자/경로 구분자, 또는 공백 없는 단일 고유명사 형태만 재검색에 사용한다.
  const looksLikeFolder = explicitlyNamed || /\d{3,}|[_-]/.test(cleaned) || !/\s/.test(cleaned);
  return looksLikeFolder ? cleaned : undefined;
}

function canConsumePending(message: string, pending: PhotoDirectPendingState): boolean {
  if (REJECT_PATTERN.test(message)) return true;
  if (pending.stage === "choose_folder") {
    const candidates = pending.items[pending.currentIndex]?.candidates ?? [];
    return Boolean(selectedCandidate(message, candidates));
  }
  if (pending.stage === "folder_retry") return Boolean(folderCorrection(message));
  if (pending.stage === "scene_settings") {
    const settings = parseExplicitSceneSettings(message, true);
    return Boolean(settings.department || settings.shootingMode);
  }
  return APPROVE_PATTERN.test(message);
}

export function shouldGuardPhotoDirectTurn(input: {
  enabled: boolean;
  userMessage: string;
  pendingState?: PhotoDirectPendingState;
}): boolean {
  if (!input.enabled) return false;
  if (parsePhotoDirectCommand(input.userMessage)) return true;
  return Boolean(input.pendingState && canConsumePending(input.userMessage, input.pendingState));
}

export function isPhotoDirectExecutionEnabled(value = process.env.OLIVIA_PHOTO_DIRECT_EXECUTION): boolean {
  return value?.trim() === "1";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)}${units[unit]}`;
}

function formatModifiedAt(value: string | null): string {
  if (!value) return "수정일 확인 불가";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "수정일 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function candidatePrompt(query: string, candidates: PhotoDirectFolderCandidate[], reports: string[]): string {
  const lines = candidates.map((candidate, index) => {
    const count = candidate.fileCount || candidate.jpgCount + candidate.rawCount;
    return `${index + 1}. ${candidate.displayName} (${count.toLocaleString("ko-KR")}장 · JPG ${candidate.jpgCount.toLocaleString("ko-KR")} · RAW ${candidate.rawCount.toLocaleString("ko-KR")} · ${formatBytes(candidate.totalBytes)} · ${formatModifiedAt(candidate.modifiedAt)})`;
  });
  return [...reports, `"${query}"와 비슷한 촬영 폴더가 ${candidates.length}개 있어요.`, ...lines, "어느 폴더인가요? 번호나 정확한 폴더명으로 알려주세요."].filter(Boolean).join("\n");
}

function sceneSettingsPrompt(folderName: string, state: PhotoDirectPendingState): string {
  const missing = [!state.department ? "진료과" : null, !state.shootingMode ? "촬영 방식(현장/스튜디오)" : null].filter(Boolean);
  return [...state.completedReports, `"${folderName}"의 Scene 분류 전에 ${missing.join("와 ")}를 알려주세요.`].filter(Boolean).join("\n");
}

function restartPrompt(folderName: string, status: string | undefined, reports: string[]): string {
  return [...reports, `"${folderName}"은(는) ${status || "기존 작업"} 상태예요. 다시 시작할까요?`].filter(Boolean).join("\n");
}

function cancelPending(state: PhotoDirectPendingState): PhotoDirectExecutionResult {
  const item = state.items[state.currentIndex];
  const label = item?.selectedDisplayName || item?.query || "사진 작업";
  return {
    handled: true,
    text: [...state.completedReports, `"${label}" 작업은 시작하지 않았어요.`].join("\n"),
    pendingState: null,
    toolCalls: [],
    reason: "cancelled",
  };
}

async function runQueue(input: {
  state: PhotoDirectPendingState;
  context: OliviaContextSnapshot;
  executeTool: ExecuteTool;
  toolCalls: PhotoDirectToolCallRecord[];
}): Promise<PhotoDirectExecutionResult> {
  const { state, context, executeTool, toolCalls } = input;

  while (state.currentIndex < state.items.length) {
    const item = state.items[state.currentIndex];
    if (!item.selectedFolder) {
      const called = await executeTool("find_photo_folder", { query: item.query }, context);
      const { result } = called.execution;
      toolCalls.push({ id: called.id, name: "find_photo_folder", success: result.success, data: result.data, error: result.error, code: result.code, verification: result.verification });
      if (!result.success) {
        state.completedReports.push(`${item.query} — 검색 실패 (${result.error || "촬영 폴더를 확인하지 못했어요."})`);
        state.currentIndex += 1;
        continue;
      }
      const candidates = candidatesFromResult(called.execution);
      if (!candidates.length) {
        state.stage = "folder_retry";
        return {
          handled: true,
          text: `${item.query} — Workstation에서 일치하는 촬영 폴더를 찾지 못했어요. 정확한 폴더명을 알려주세요.`,
          pendingState: state,
          toolCalls,
          reason: "needs_input",
        };
      }
      if (candidates.length > 1) {
        item.candidates = candidates;
        state.stage = "choose_folder";
        return { handled: true, text: candidatePrompt(item.query, candidates, state.completedReports), pendingState: state, toolCalls, reason: "needs_input" };
      }
      item.selectedFolder = candidates[0].sourceRelativePath;
      item.selectedDisplayName = candidates[0].displayName;
    }

    if (state.operation === "scene_sort" && (!state.department || !state.shootingMode)) {
      state.stage = "scene_settings";
      return {
        handled: true,
        text: sceneSettingsPrompt(item.selectedDisplayName || item.selectedFolder, state),
        pendingState: state,
        toolCalls,
        reason: "needs_input",
      };
    }

    // MCP bridge와 같은 수정 권한 경계를 직접 실행 경로에도 적용한다. 관리자 인증을 통과했더라도
    // 현재 화면 context가 명시적으로 read-only이면 사진 job을 우회 생성하지 않는다.
    if (context.canEdit === false) {
      state.completedReports.push(`${item.selectedDisplayName || item.selectedFolder} — 현재 화면에서는 사진 작업을 실행할 권한이 없어요. 원본은 변경하지 않았어요.`);
      state.currentIndex += 1;
      continue;
    }

    const toolName = state.operation === "source_prep" ? "start_photo_source_prep" : "start_photo_scene_sort";
    const toolInput: Record<string, unknown> = {
      folderName: item.selectedFolder,
      confirmRestart: item.confirmRestart === true,
      ...(state.operation === "scene_sort" ? { department: state.department, shootingMode: state.shootingMode } : {}),
    };
    const called = await executeTool(toolName, toolInput, context);
    const { result } = called.execution;
    toolCalls.push({ id: called.id, name: toolName, success: result.success, data: result.data, error: result.error, code: result.code, verification: result.verification });
    if (!result.success && result.code === "PHOTO_PROJECT_RESTART_CONFIRMATION_REQUIRED") {
      state.stage = "restart_confirmation";
      const status = string(result.details?.status);
      return {
        handled: true,
        text: restartPrompt(item.selectedDisplayName || item.selectedFolder, status, state.completedReports),
        pendingState: state,
        toolCalls,
        reason: "needs_input",
      };
    }
    if (result.success) {
      state.completedReports.push(`${item.selectedDisplayName || item.selectedFolder} — ${string(result.data?.summary) || "작업을 시작했습니다. 진행 중입니다."}`);
    } else {
      state.completedReports.push(`${item.selectedDisplayName || item.selectedFolder} — 실패 (${result.error || "작업을 시작하지 못했어요."}) 원본은 변경하지 않았어요.`);
    }
    state.currentIndex += 1;
  }

  return {
    handled: true,
    text: state.completedReports.join("\n") || "사진 작업 요청을 확인했어요.",
    pendingState: null,
    toolCalls,
    reason: "executed",
  };
}

export async function executePhotoDirectTurn(input: {
  enabled: boolean;
  userMessage: string;
  hermesToolNames: string[];
  pendingState?: PhotoDirectPendingState;
  context: OliviaContextSnapshot;
  executeTool: ExecuteTool;
  now?: string;
}): Promise<PhotoDirectExecutionResult> {
  if (!input.enabled) return { handled: false, toolCalls: [], reason: "disabled" };
  if (input.hermesToolNames.some((name) => PHOTO_TOOL_NAMES.has(normalizeToolName(name)))) {
    return { handled: false, toolCalls: [], reason: "hermes_already_called" };
  }

  const command = parsePhotoDirectCommand(input.userMessage);
  let state: PhotoDirectPendingState | undefined;
  if (command) {
    state = {
      version: 1,
      operation: command.operation,
      stage: "choose_folder",
      items: command.folderQueries.map((query) => ({ query })),
      currentIndex: 0,
      completedReports: [],
      ...(command.department ? { department: command.department } : {}),
      ...(command.shootingMode ? { shootingMode: command.shootingMode } : {}),
      createdAt: input.now ?? new Date().toISOString(),
    };
  } else if (input.pendingState && canConsumePending(input.userMessage, input.pendingState)) {
    state = structuredClone(input.pendingState);
    if (REJECT_PATTERN.test(input.userMessage)) {
      if (state.stage === "restart_confirmation" && state.currentIndex < state.items.length - 1) {
        const current = state.items[state.currentIndex];
        state.completedReports.push(`${current.selectedDisplayName || current.query} — 다시 시작하지 않았어요.`);
        state.currentIndex += 1;
        return runQueue({ state, context: input.context, executeTool: input.executeTool, toolCalls: [] });
      }
      return cancelPending(state);
    }
    const current = state.items[state.currentIndex];
    if (state.stage === "choose_folder") {
      const selected = selectedCandidate(input.userMessage, current.candidates ?? []);
      if (!selected) return { handled: false, toolCalls: [], reason: "no_intent" };
      current.selectedFolder = selected.sourceRelativePath;
      current.selectedDisplayName = selected.displayName;
      delete current.candidates;
    } else if (state.stage === "folder_retry") {
      const corrected = folderCorrection(input.userMessage);
      if (!corrected) return { handled: false, toolCalls: [], reason: "no_intent" };
      current.query = corrected;
      delete current.selectedFolder;
      delete current.selectedDisplayName;
      delete current.candidates;
      state.stage = "choose_folder";
    } else if (state.stage === "scene_settings") {
      const settings = parseExplicitSceneSettings(input.userMessage, true);
      state.department = settings.department ?? state.department;
      state.shootingMode = settings.shootingMode ?? state.shootingMode;
    } else if (state.stage === "restart_confirmation") {
      if (!APPROVE_PATTERN.test(input.userMessage)) return { handled: false, toolCalls: [], reason: "no_intent" };
      current.confirmRestart = true;
    }
  } else {
    return { handled: false, toolCalls: [], reason: "no_intent" };
  }

  return runQueue({ state, context: input.context, executeTool: input.executeTool, toolCalls: [] });
}
