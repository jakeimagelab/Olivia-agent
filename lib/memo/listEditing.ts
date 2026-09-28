const BULLET_MARKS = ["•", "◦", "▪"] as const;

type ListLine = { indent: string; marker: string; text: string } | null;

function parseListLine(line: string): ListLine {
  const match = line.match(/^( *)(•|◦|▪|☐|\d+\.)\s?(.*)$/);
  return match ? { indent: match[1], marker: match[2], text: match[3] } : null;
}

export function applyAutoBullet(line: string, cursor: number): { text: string; cursor: number } {
  if (cursor !== line.length) return { text: line, cursor };
  const replacements: Record<string, string> = {
    "- ": "• ",
    "* ": "• ",
    "[] ": "☐ ",
    "[ ] ": "☐ ",
  };
  const replacement = replacements[line];
  return replacement ? { text: replacement, cursor: replacement.length } : { text: line, cursor };
}

export function continueList(currentLine: string): string {
  const parsed = parseListLine(currentLine);
  if (!parsed) return "";
  if (!parsed.text.trim()) return "";
  if (/^\d+\.$/.test(parsed.marker)) {
    return `${parsed.indent}${Number.parseInt(parsed.marker, 10) + 1}. `;
  }
  return `${parsed.indent}${parsed.marker} `;
}

export function changeIndent(line: string, direction: 1 | -1): string {
  const parsed = parseListLine(line);
  if (!parsed) return line;
  // • → ◦ → ▪가 곧 1·2·3단계다. 공백 수만 보면 마지막 기호가 한 단계 더
  // 들어가는 문제가 생기므로, 기호를 우선 진실로 삼는다.
  const markerLevel = BULLET_MARKS.indexOf(parsed.marker as (typeof BULLET_MARKS)[number]);
  const level = markerLevel >= 0 ? markerLevel : Math.min(BULLET_MARKS.length - 1, Math.floor(parsed.indent.length / 2));
  if (direction === -1 && level === 0) return parsed.text;
  const nextLevel = Math.max(0, Math.min(BULLET_MARKS.length - 1, level + direction));
  if (nextLevel === level) return line;
  const marker = BULLET_MARKS[Math.min(nextLevel, BULLET_MARKS.length - 1)] ?? parsed.marker;
  return `${"  ".repeat(nextLevel)}${marker} ${parsed.text}`;
}
