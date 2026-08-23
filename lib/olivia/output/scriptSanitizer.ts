// 한국어 응답에 아랍어/히브리어/키릴/데바나가리 등 정당한 이유 없이 섞여 들어오는 "이상 문자"를
// 감지한다. 이 앱(포토클리닉 국내 스튜디오 운영 도구)에서 이런 스크립트가 정상적으로 등장할
// 이유가 없으므로 비율 계산 없이 1글자만 있어도 anomalous로 본다. 한글/라틴/숫자/문장부호/
// 이모지/URL/코드/한자(소량)는 전부 허용 — 별도 화이트리스트 체크 없이 그냥 검사 대상에서 뺐다.

const ABNORMAL_SCRIPT_CHAR = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Cyrillic}\p{Script=Devanagari}\p{Script=Thai}\p{Script=Armenian}\p{Script=Georgian}]/gu;

function isControlOrSurrogateCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x08) return true;
  if (codePoint === 0x0b || codePoint === 0x0c) return true;
  if (codePoint >= 0x0e && codePoint <= 0x1f) return true;
  if (codePoint >= 0xe000 && codePoint <= 0xf8ff) return true;
  if (codePoint >= 0xfff0 && codePoint <= 0xffff) return true;
  return false;
}

const SCRIPT_LABELS: Array<{ test: RegExp; label: string }> = [
  { test: /\p{Script=Arabic}/u, label: "Arabic" },
  { test: /\p{Script=Hebrew}/u, label: "Hebrew" },
  { test: /\p{Script=Cyrillic}/u, label: "Cyrillic" },
  { test: /\p{Script=Devanagari}/u, label: "Devanagari" },
  { test: /\p{Script=Thai}/u, label: "Thai" },
  { test: /\p{Script=Armenian}/u, label: "Armenian" },
  { test: /\p{Script=Georgian}/u, label: "Georgian" },
];

function labelForChar(char: string): string {
  return SCRIPT_LABELS.find((entry) => entry.test.test(char))?.label ?? "unknown";
}

export interface ScriptAnomalyRange { start: number; end: number; script: string }
export interface ScriptAnomalyResult { clean: boolean; offendingRanges: ScriptAnomalyRange[] }

export function detectAbnormalScript(text: string): ScriptAnomalyResult {
  if (!text) return { clean: true, offendingRanges: [] };
  const offendingRanges: ScriptAnomalyRange[] = [];

  for (const match of text.matchAll(ABNORMAL_SCRIPT_CHAR)) {
    if (match.index === undefined) continue;
    offendingRanges.push({ start: match.index, end: match.index + match[0].length, script: labelForChar(match[0]) });
  }

  for (let i = 0; i < text.length; i += 1) {
    const codePoint = text.codePointAt(i);
    if (codePoint !== undefined && isControlOrSurrogateCodePoint(codePoint)) {
      offendingRanges.push({ start: i, end: i + 1, script: "control" });
    }
  }

  return { clean: offendingRanges.length === 0, offendingRanges };
}

const STACK_TRACE_PATTERN = /\bat\s+.*\.(ts|tsx|js):\d+:\d+/;
const RAW_JSON_ERROR_PATTERN = /^\{[\s\S]*"error"[\s\S]*\}$/;
const MAX_HISTORY_MESSAGE_LENGTH = 4000;

/**
 * 대화 히스토리를 모델에게 다시 보내기 전, 빈 값/거대한 덤프/raw JSON 에러/스택트레이스/이상
 * 스크립트가 섞인 과거 메시지를 걸러낸다. DB에서 지우지 않는다 — 이번 요청의 프롬프트 조립에서만
 * 제외한다.
 */
export function isWellFormedHistoryText(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (trimmed.length > MAX_HISTORY_MESSAGE_LENGTH) return false;
  if (STACK_TRACE_PATTERN.test(trimmed)) return false;
  if (RAW_JSON_ERROR_PATTERN.test(trimmed)) return false;
  if (!detectAbnormalScript(trimmed).clean) return false;
  return true;
}
