import type { OliviaAgentToolExecution, OliviaContextSnapshot, OliviaToolVerification } from "@/lib/olivia/v2/types";
import { matchPhotoFoldersInMessage } from "@/lib/photo-storage/photoFolderCatalog";
import type { FolderMatch } from "@/lib/photo-storage/folderMatch";
import type { RemoteNasDataSource } from "@/lib/remote-nas/types";
import {
  buildFailureReport,
  resolveTimeoutVerdict,
  type ExecutionVerdict,
} from "@/lib/photo-storage/executionVerdict";

export type PhotoDirectOperation = "source_prep" | "scene_sort";
export type PhotoSortOnly = "all" | "연출" | "프로필" | "인테리어";
export type PhotoDirectPendingStage = "choose_folder" | "folder_retry" | "restart_confirmation" | "manual_workspace";

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
  /** 타임아웃 뒤 시작 여부를 끝내 확인하지 못한 폴더. 재실행 전에 한 번 확인받는다. */
  startVerdictUnknown?: boolean;
};

export type PhotoDirectPendingState = {
  version: 1;
  operation: PhotoDirectOperation;
  stage: PhotoDirectPendingStage;
  items: PhotoDirectWorkItem[];
  currentIndex: number;
  completedReports: string[];
  /** 전체/연출/프로필/인테리어 중 사용자가 요청한 결과만 정리한다. */
  only?: PhotoSortOnly;
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

// "정리"와 "분류"는 같은 말이다. 1차/2차는 실제 하위 폴더명에도 들어가므로
// 더 이상 작업 명령으로 해석하지 않는다(2026-09-30).
const SOURCE_PREP_PATTERN = /(?:jpg\s*(?:정리|분류|통합)|원본(?:을|를)?\s*(?:분리|분류)|raw\s*(?:[·/&+]|와|과)?\s*jpg(?:를|을)?\s*(?:로\s*)?분리|jpg(?:만|를|을)?\s*(?:로\s*)?(?:분리|통합|(?:줘|줄래)))(?:\s*(?:해\s*줄래|해줄래|해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?/i;
const SCENE_SORT_PATTERN = /(?:(?:연출|프로필|인테리어)\s*(?:정리|분류)|(?:씬|scene)(?:\s*별)?(?:로|을|를)?\s*분류|사진(?:을|를)?\s*분류|(?<!원본\s)분류(?:\s*(?:좀|바로|전체))?(?:\s*(?:해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?)/i;
const MULTI_FOLDER_SPLIT_PATTERN = /분리(?:\s*(?:해\s*줘|해주세요|해줘|해|시작해|실행해|진행해))?/i;
const PHOTO_TOOL_NAMES = new Set(["find_photo_folder", "start_photo_source_prep", "start_photo_scene_sort"]);
const APPROVE_PATTERN = /^(?:응|네|예|그래|맞아|좋아|오케이|ok|ㅇㅇ|해\s*줘|진행해|다시\s*(?:해|시작해)|재시도)(?:[.!~\s]|$)/i;
const REJECT_PATTERN = /^(?:아니|아니야|취소|하지\s*마|안\s*할래|됐어|그만)(?:[.!~\s]|$)/i;

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

function parseOperation(message: string): { operation: PhotoDirectOperation; only?: PhotoSortOnly } | null {
  const source = message.match(SOURCE_PREP_PATTERN);
  const scene = message.match(SCENE_SORT_PATTERN);
  if (source && scene) return null;
  if (source) return { operation: "source_prep" };
  if (scene) {
    const only: PhotoSortOnly = /연출\s*(?:정리|분류)/i.test(message)
      ? "연출"
      : /프로필\s*(?:정리|분류)/i.test(message)
        ? "프로필"
        : /인테리어\s*(?:정리|분류)/i.test(message)
          ? "인테리어"
          : "all";
    return { operation: "scene_sort", only };
  }
  // "르셀청담이랑 세무사회 두 개 분리해줘"처럼 대상이 명백히 여러 개인 축약 표현만 원본
  // 분리로 허용한다. 단일 "Scene을 분리해줘"를 JPG 통합으로 오인하면 실제 job이 생기므로,
  // 일반적인 '분리' 한 단어만으로는 절대 실행하지 않는다.
  const multiFolderSplit = message.match(MULTI_FOLDER_SPLIT_PATTERN);
  if (multiFolderSplit && /(?:두\s*(?:개|곳)|둘\s*다|이랑\s+|랑\s+|하고\s+|그리고\s+|,|와\s+|과\s+)/.test(message)) {
    return { operation: "source_prep" };
  }
  return null;
}

export function parsePhotoDirectCommand(message: string): {
  operation: PhotoDirectOperation;
  only?: PhotoSortOnly;
} | null {
  const parsed = parseOperation(message);
  if (!parsed) return null;
  return parsed;
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
    ...(raw.startVerdictUnknown === true ? { startVerdictUnknown: true } : {}),
  };
}

export function readPendingPhotoDirectExecution(metadata: unknown): PhotoDirectPendingState | undefined {
  const raw = record(record(metadata)?.pendingPhotoDirectExecution);
  if (!raw || raw.version !== 1 || (raw.operation !== "source_prep" && raw.operation !== "scene_sort")) return undefined;
  if (!(["choose_folder", "folder_retry", "restart_confirmation", "manual_workspace"] as unknown[]).includes(raw.stage)) return undefined;
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
    ...(raw.only === "all" || raw.only === "연출" || raw.only === "프로필" || raw.only === "인테리어" ? { only: raw.only } : {}),
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

function canConsumePending(message: string, pending: PhotoDirectPendingState): boolean {
  if (REJECT_PATTERN.test(message)) return true;
  if (pending.stage === "choose_folder") {
    const candidates = pending.items[pending.currentIndex]?.candidates ?? [];
    return Boolean(selectedCandidate(message, candidates));
  }
  // 실제 폴더 목록과의 대조는 async라 executePhotoDirectTurn에서 한다. 여기서는 대기 중인
  // 사용자의 답을 한 번 확인 대상으로만 올리고, 목록 매치가 없으면 일반 대화로 되돌려보낸다.
  if (pending.stage === "folder_retry") return Boolean(message.trim());
  if (pending.stage === "manual_workspace") return APPROVE_PATTERN.test(message);
  return APPROVE_PATTERN.test(message);
}

function workItemsFromMatchGroups(groups: readonly FolderMatch[][]): PhotoDirectWorkItem[] {
  return groups.map((group) => {
    const first = group[0];
    if (group.length === 1) {
      return {
        query: first.core,
        // matchPhotoFoldersInMessage의 입력은 Workstation 루트의 실제 displayName 목록이다.
        // 정규화 문자열이 아니라 이 원본 이름을 그대로 start tool의 exact resolver에 넘긴다.
        selectedFolder: first.displayName,
        selectedDisplayName: first.displayName,
      };
    }
    // 동일 핵심명으로 실제 폴더가 여러 개면 기존 find tool로 장수·용량·수정일을 채운 뒤
    // 사용자에게 선택을 받는다. 여기서는 어떤 후보도 임의로 고르지 않는다.
    return { query: first.core };
  });
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

const VERIFICATION_WAIT_MS = 2_000;
const VERIFICATION_ATTEMPTS = 3;

async function verifyPhotoStart(input: {
  executeTool: ExecuteTool;
  context: OliviaContextSnapshot;
  projectName: string;
  requestedAt: string;
  waitMs?: number;
}): Promise<ExecutionVerdict> {
  if (!input.projectName) return "unknown";
  const waitMs = input.waitMs ?? VERIFICATION_WAIT_MS;
  for (let attempt = 0; attempt < VERIFICATION_ATTEMPTS; attempt += 1) {
    if (attempt > 0 && waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    let verdict: ExecutionVerdict;
    try {
      const called = await input.executeTool(
        "get_photo_storage_status",
        { projectId: null, projectName: input.projectName },
        input.context,
      );
      const { result } = called.execution;
      if (!result.success) {
        // "찾지 못했어요"는 조회 실패가 아니라 '없다'는 답이다. 그 둘을 섞으면
        // 시작 안 된 것을 "모름"으로 보고하게 된다.
        const missing = /찾지\s*못했|없어요/.test(result.error || "");
        verdict = missing
          ? resolveTimeoutVerdict({ requestedAt: input.requestedAt, probe: { found: false }, lookupFailed: false })
          : "unknown";
      } else {
        const project = record(result.data?.project);
        verdict = resolveTimeoutVerdict({
          requestedAt: input.requestedAt,
          probe: {
            found: Boolean(project),
            updatedAt: string(project?.updatedAt) ?? string(project?.updated_at) ?? null,
          },
          lookupFailed: false,
        });
      }
    } catch {
      verdict = "unknown";
    }
    if (verdict === "started") return verdict;
    if (attempt === VERIFICATION_ATTEMPTS - 1) return verdict;
  }
  return "unknown";
}

async function runQueue(input: {
  state: PhotoDirectPendingState;
  context: OliviaContextSnapshot;
  executeTool: ExecuteTool;
  toolCalls: PhotoDirectToolCallRecord[];
  verificationWaitMs?: number;
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

    // MCP bridge와 같은 수정 권한 경계를 직접 실행 경로에도 적용한다. 관리자 인증을 통과했더라도
    // 현재 화면 context가 명시적으로 read-only이면 사진 job을 우회 생성하지 않는다.
    if (context.canEdit === false) {
      state.completedReports.push(buildFailureReport({
        label: item.selectedDisplayName || item.selectedFolder || "사진 작업",
        error: "현재 화면에서는 사진 작업을 실행할 권한이 없어요.",
        failure: { kind: "certain" },
      }));
      state.currentIndex += 1;
      continue;
    }

    const toolName = state.operation === "source_prep" ? "start_photo_source_prep" : "start_photo_scene_sort";
    const toolInput: Record<string, unknown> = {
      folderName: item.selectedFolder,
      confirmRestart: item.confirmRestart === true,
      ...(state.operation === "scene_sort" ? { only: state.only ?? "all" } : {}),
    };
    // 타임아웃 뒤 "이번 요청으로 시작된 것인지"를 가리려면 요청 시각이 필요하다.
    // 같은 폴더를 예전에 돌린 프로젝트가 남아 있을 수 있다.
    const startedAt = new Date().toISOString();
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
    if (!result.success && result.code === "PHOTO_JPG_PREP_REQUIRED") {
      return {
        handled: true,
        text: [...state.completedReports, `"${item.selectedDisplayName || item.selectedFolder}"은(는) JPG정리가 안 됐어요. 먼저 할까요?`].join("\n"),
        pendingState: { ...state, operation: "source_prep", stage: "restart_confirmation" },
        toolCalls,
        reason: "needs_input",
      };
    }
    if (!result.success && result.code === "PHOTO_AI_UNAVAILABLE") {
      return {
        handled: true,
        text: "자동 기능이 꺼져 있습니다. 수동으로 직접하시겠습니까?",
        pendingState: { ...state, stage: "manual_workspace" },
        toolCalls,
        reason: "needs_input",
      };
    }
    const label = item.selectedDisplayName || item.selectedFolder || "사진 작업";
    if (result.success) {
      state.completedReports.push(`${label} — ${string(result.data?.summary) || "작업을 시작했습니다. 진행 중입니다."}`);
    } else if (result.code === "PHOTO_DIRECT_TIMEOUT") {
      // 시간이 지난 것은 실패가 아니다. 실제로 시작됐는지 서버에서 확인한 뒤에 말한다.
      // "사진 작업 상태에서 확인해주세요"는 시스템이 할 일을 사용자에게 떠넘기는 것이었다.
      const verdict = await verifyPhotoStart({
        executeTool,
        context,
        projectName: item.selectedDisplayName || item.selectedFolder || "",
        requestedAt: startedAt,
        waitMs: input.verificationWaitMs,
      });
      if (verdict === "unknown") item.startVerdictUnknown = true;
      state.completedReports.push(buildFailureReport({ label, error: result.error, failure: { kind: "timeout", verdict } }));
    } else {
      state.completedReports.push(buildFailureReport({ label, error: result.error, failure: { kind: "certain" } }));
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
  dataSource: RemoteNasDataSource;
  executeTool: ExecuteTool;
  now?: string;
  /** 타임아웃 뒤 재확인 간격(ms). 테스트에서 0으로 줄인다. */
  verificationWaitMs?: number;
}): Promise<PhotoDirectExecutionResult> {
  if (!input.enabled) return { handled: false, toolCalls: [], reason: "disabled" };
  if (input.hermesToolNames.some((name) => PHOTO_TOOL_NAMES.has(normalizeToolName(name)))) {
    return { handled: false, toolCalls: [], reason: "hermes_already_called" };
  }

  const command = parsePhotoDirectCommand(input.userMessage);
  let state: PhotoDirectPendingState | undefined;
  if (command) {
    const matchGroups = await matchPhotoFoldersInMessage(input.userMessage, input.dataSource);
    state = {
      version: 1,
      operation: command.operation,
      stage: matchGroups.length ? "choose_folder" : "folder_retry",
      items: matchGroups.length
        ? workItemsFromMatchGroups(matchGroups)
        : [{ query: input.userMessage }],
      currentIndex: 0,
      completedReports: [],
      ...(command.only ? { only: command.only } : {}),
      createdAt: input.now ?? new Date().toISOString(),
    };
    if (!matchGroups.length) {
      return {
        handled: true,
        text: "Workstation에서 요청과 일치하는 촬영 폴더를 찾지 못했어요. 정확한 폴더명을 알려주세요.",
        pendingState: state,
        toolCalls: [],
        reason: "needs_input",
      };
    }
  } else if (input.pendingState && canConsumePending(input.userMessage, input.pendingState)) {
    state = structuredClone(input.pendingState);
    if (REJECT_PATTERN.test(input.userMessage)) {
      if (state.stage === "restart_confirmation" && state.currentIndex < state.items.length - 1) {
        const current = state.items[state.currentIndex];
        state.completedReports.push(`${current.selectedDisplayName || current.query} — 다시 시작하지 않았어요.`);
        state.currentIndex += 1;
        return runQueue({ state, context: input.context, executeTool: input.executeTool, toolCalls: [], verificationWaitMs: input.verificationWaitMs });
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
      const matchGroups = await matchPhotoFoldersInMessage(input.userMessage, input.dataSource);
      if (!matchGroups.length) return { handled: false, toolCalls: [], reason: "no_intent" };
      state.items.splice(state.currentIndex, 1, ...workItemsFromMatchGroups(matchGroups));
      state.stage = "choose_folder";
    } else if (state.stage === "manual_workspace") {
      // 자동 분류를 시작하지 못한 경우에도 사용자가 수긍하면 같은 open_feature 도구를
      // 호출해 사진작업실을 연다. 도구 성공과 UI action이 확인되기 전에는 "열었다"고
      // 말하지 않는다.
      const called = await input.executeTool(
        "open_feature",
        { featureQuery: "사진작업실", hospitalName: null },
        input.context,
      );
      const { result } = called.execution;
      const toolCall: PhotoDirectToolCallRecord = {
        id: called.id,
        name: "open_feature",
        success: result.success,
        data: result.data,
        error: result.error,
        code: result.code,
        verification: result.verification,
      };
      return result.success && result.data?.matched !== false
        ? { handled: true, text: "사진작업실을 열었어요. 수동으로 사진을 정리할 수 있습니다.", pendingState: null, toolCalls: [toolCall], reason: "executed" }
        : { handled: true, text: "사진작업실을 열지 못했어요. 화면에서 사진작업실을 선택해주세요.", pendingState: null, toolCalls: [toolCall], reason: "executed" };
    } else if (state.stage === "restart_confirmation") {
      if (!APPROVE_PATTERN.test(input.userMessage)) return { handled: false, toolCalls: [], reason: "no_intent" };
      current.confirmRestart = true;
    }
  } else {
    return { handled: false, toolCalls: [], reason: "no_intent" };
  }

  return runQueue({ state, context: input.context, executeTool: input.executeTool, toolCalls: [], verificationWaitMs: input.verificationWaitMs });
}
