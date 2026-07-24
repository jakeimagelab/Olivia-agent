type MeasureText = (text: string) => number;

type WrapToken = {
  text: string;
  joinWithPrevious: boolean;
};

function splitOversizedToken(token: string, maxWidth: number, measureText: MeasureText): WrapToken[] {
  const chunks: WrapToken[] = [];
  let chunk = "";

  for (const character of Array.from(token)) {
    const candidate = chunk + character;
    if (chunk && measureText(candidate) > maxWidth) {
      chunks.push({ text: chunk, joinWithPrevious: chunks.length > 0 });
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push({ text: chunk, joinWithPrevious: chunks.length > 0 });
  return chunks;
}

/**
 * Keeps Korean words intact and balances the remaining width across lines.
 * Character-level wrapping is reserved for a single token wider than the card.
 */
export function wrapQuoteText(text: string, maxWidth: number, measureText: MeasureText): string[] {
  if (maxWidth <= 0) return [];

  const tokens: WrapToken[] = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (
      measureText(word) <= maxWidth
        ? [{ text: word, joinWithPrevious: false }]
        : splitOversizedToken(word, maxWidth, measureText)
    ));

  if (tokens.length === 0) return [];

  const costs = Array(tokens.length + 1).fill(Number.POSITIVE_INFINITY) as number[];
  const nextBreak = Array(tokens.length).fill(tokens.length) as number[];
  costs[tokens.length] = 0;

  for (let start = tokens.length - 1; start >= 0; start -= 1) {
    let line = "";

    for (let end = start; end < tokens.length; end += 1) {
      const token = tokens[end];
      line += end === start || token.joinWithPrevious ? token.text : ` ${token.text}`;

      const width = measureText(line);
      if (width > maxWidth) break;

      const remaining = maxWidth - width;
      const isLastLine = end === tokens.length - 1;
      const raggedness = remaining * remaining * (isLastLine ? 0.65 : 1);
      const cost = raggedness + costs[end + 1];

      if (cost < costs[start]) {
        costs[start] = cost;
        nextBreak[start] = end + 1;
      }
    }
  }

  const lines: string[] = [];
  for (let start = 0; start < tokens.length;) {
    const end = nextBreak[start];
    let line = "";

    for (let index = start; index < end; index += 1) {
      const token = tokens[index];
      line += index === start || token.joinWithPrevious ? token.text : ` ${token.text}`;
    }

    lines.push(line);
    start = end;
  }

  return lines;
}
