const KOREAN_DIGITS: Record<string, number> = {
  영: 0, 공: 0, 일: 1, 한: 1, 하나: 1, 이: 2, 두: 2, 둘: 2, 삼: 3, 세: 3, 셋: 3,
  사: 4, 네: 4, 넷: 4, 오: 5, 다섯: 5, 육: 6, 여섯: 6, 칠: 7, 일곱: 7,
  팔: 8, 여덟: 8, 구: 9, 아홉: 9,
};

function compact(value: string) {
  return value.trim().replace(/[\s,원]/g, "");
}

function parseSimpleKoreanNumber(value: string): number | undefined {
  const source = compact(value).replace(/(개|명|번|번째|컷)$/g, "");
  if (/^\d+(?:\.\d+)?$/.test(source)) return Number(source);
  if (KOREAN_DIGITS[source] !== undefined) return KOREAN_DIGITS[source];

  let total = 0;
  let current = 0;
  let matched = false;
  for (const char of source) {
    if (KOREAN_DIGITS[char] !== undefined) {
      current = KOREAN_DIGITS[char];
      matched = true;
    } else if (char === "십") {
      total += (current || 1) * 10;
      current = 0;
      matched = true;
    } else if (char === "백") {
      total += (current || 1) * 100;
      current = 0;
      matched = true;
    } else if (char === "천") {
      total += (current || 1) * 1000;
      current = 0;
      matched = true;
    } else {
      return undefined;
    }
  }
  return matched ? total + current : undefined;
}

export function parseKoreanMoney(value: string | number): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return undefined;
    return value > 0 && value < 10_000 ? Math.round(value * 10_000) : Math.round(value);
  }
  const source = compact(value);
  if (!source) return undefined;
  const eok = source.match(/^(.+?)억(?:만)?$/);
  if (eok) {
    const amount = parseSimpleKoreanNumber(eok[1]);
    return amount === undefined ? undefined : amount * 100_000_000;
  }
  const man = source.match(/^(.+?)만$/);
  if (man) {
    const amount = parseSimpleKoreanNumber(man[1]);
    return amount === undefined ? undefined : amount * 10_000;
  }
  const amount = parseSimpleKoreanNumber(source);
  if (amount === undefined) return undefined;
  return amount > 0 && amount < 10_000 ? Math.round(amount * 10_000) : Math.round(amount);
}

export function parseKoreanCount(value: string | number): number | undefined {
  const amount = typeof value === "number" ? value : parseSimpleKoreanNumber(value);
  return amount !== undefined && Number.isInteger(amount) && amount > 0 ? amount : undefined;
}

export function parseShotPosition(value: string | number): number | undefined {
  const amount = parseKoreanCount(value);
  return amount === undefined ? undefined : amount - 1;
}

const LAST_POSITION_PATTERN = /(마지막|맨\s*아래|맨\s*뒤|끝)/;
const FIRST_POSITION_PATTERN = /(처음|첫\s*번째|맨\s*위)/;

// 목록 길이를 알아야만 "마지막"을 실제 인덱스로 바꿀 수 있어 parseShotPosition과 분리했다.
// 숫자 표현("2번")을 먼저 시도하고, 실패하면 "마지막"/"처음" 계열 키워드를 본다.
export function resolveOrdinalReference(value: string | number, count: number): number | undefined {
  const numeric = parseShotPosition(value);
  if (numeric !== undefined) return numeric;
  if (typeof value !== "string" || count <= 0) return undefined;
  const source = value.trim();
  if (LAST_POSITION_PATTERN.test(source)) return count - 1;
  if (FIRST_POSITION_PATTERN.test(source)) return 0;
  return undefined;
}
