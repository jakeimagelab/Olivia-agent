import { jakeimageSingleItems, packageOptions, packages, singleItems } from "@/lib/quote/quoteCatalog";

export type ParsedQuoteItem = {
  name: string;
  note: string | null;
  details: string[];
  amount: number | null;
  quantity: number;
  free: boolean;
};

export type ParsedQuoteRequest = {
  clientName: string | null;
  titleSuffix: string | null;
  isEvent: boolean;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  emailCorrectedFrom: string | null;
  items: ParsedQuoteItem[];
  discount: { label: string | null; type: "percent" | "amount"; value: number } | null;
  fixedTotal: number | null;
  roundDownUnit: number | null;
  memo: string | null;
  unparsedLines: string[];
};

type CatalogEntry = { id: string; name: string; price: number; package?: boolean };

const EVENT_PATTERN = /(행사|이벤트|기념|주년|세미나|학회|심포지엄|학술대회|개원식|창립|워크숍|오픈식)/i;
const COMMAND_ENDING = /(?:만들어줘|만들자|해줘|해주세요|부탁해|결정|적용)\s*$/;
const CONTENT_HEADING = /^(?:내용은?|아래와 같이|다음과 같이)$/;
const PHONE = /^0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}$/;
const CONTACT = /^[^\n]{1,20}(?:[가-힣]{2,}|[A-Za-z]{2,})(?:\s*(?:대표|원장|팀장|실장|매니저|담당자|이사|부장|과장))?님$/;
const EXTERNAL_ITEM = /(헤어\s*메이크업|메이크업|헤메|모델\s*섭외|모델료|섭외|푸드\s*스타일링|재료\s*구입)/i;

const CATALOG: CatalogEntry[] = [
  ...packages.map((entry) => ({ ...entry, package: true })),
  ...singleItems,
  ...packageOptions,
  ...jakeimageSingleItems,
];

function normalized(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s_\-]+/g, "");
}

function stripLeader(line: string) {
  return line.replace(/^\s*(?:(?:[*•\-·>]+)|(?:\d+[.)]))\s*/, "").trim();
}

function moneyFromToken(raw: string, unit: string | undefined) {
  const numeric = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return null;
  if (unit === "원") return Math.round(numeric);
  if (unit === "만" || unit === "만원") return Math.round(numeric * 10_000);
  return Math.round(numeric * 10_000);
}

function findMoney(line: string): { amount: number; start: number; end: number } | null {
  const explicit = /(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원)/g;
  const matches = [...line.matchAll(explicit)];
  if (matches.length) {
    const match = matches[matches.length - 1];
    const amount = moneyFromToken(match[1], match[2]);
    if (amount !== null && match.index !== undefined) return { amount, start: match.index, end: match.index + match[0].length };
  }
  // 단위 없는 숫자는 항목 맨 끝에 독립적으로 놓인 경우만 만원 단위로 읽는다.
  const bare = /(?:^|\s)(\d{1,4})\s*$/.exec(line);
  if (!bare || bare.index === undefined) return null;
  return { amount: moneyFromToken(bare[1], undefined)!, start: bare.index + bare[0].indexOf(bare[1]), end: bare.index + bare[0].length };
}

function catalogMatch(line: string): CatalogEntry | null {
  const source = normalized(line).replace(/서비스|무료|무상/g, "");
  const matches = CATALOG
    .filter((entry) => normalized(entry.name).length >= 3 && source.includes(normalized(entry.name)))
    .sort((a, b) => normalized(b.name).length - normalized(a.name).length);
  return matches[0] ?? null;
}

function itemFromLine(line: string): ParsedQuoteItem | null {
  const quantityMatch = /(?:×|x)\s*(\d+)/i.exec(line);
  const quantity = quantityMatch ? Math.max(1, Number(quantityMatch[1]) || 1) : 1;
  const withoutQuantity = line.replace(/\s*(?:×|x)\s*\d+/ig, " ").trim();
  const free = /(?:서비스|무료|무상)\s*$/i.test(withoutQuantity);
  const withoutFree = withoutQuantity.replace(/\s*(?:서비스|무료|무상)\s*$/i, "").trim();
  const price = findMoney(withoutFree);
  if (price) {
    const before = withoutFree.slice(0, price.start).trim();
    let tail = withoutFree.slice(price.end).trim();
    const noteMatch = /^\(([^()]*)\)/.exec(tail);
    const note = noteMatch?.[1].trim() || null;
    if (noteMatch) tail = tail.slice(noteMatch[0].length).trim();
    const name = before.trim();
    if (!name) return null;
    return { name, note, details: tail ? [tail] : [], amount: free ? 0 : price.amount, quantity, free };
  }

  const profileAddition = /(?:의료진\s*)?프로필\s*(\d+)\s*(?:명|인)?\s*추가/.exec(withoutFree);
  if (profileAddition) {
    const count = Math.max(1, Number(profileAddition[1]) || 1);
    return { name: "프로필 인원 추가", note: null, details: [], amount: free ? 0 : 250000, quantity: count, free };
  }
  const entry = catalogMatch(withoutFree);
  if (entry) return { name: entry.name, note: null, details: [], amount: free ? 0 : entry.price, quantity, free };
  if (free || EXTERNAL_ITEM.test(withoutFree)) {
    return { name: withoutFree, note: null, details: [], amount: free ? 0 : null, quantity, free };
  }
  return null;
}

function correctedEmail(raw: string) {
  const markdown = /\[[^\]]*\]\(mailto:([^\s)]+)\)/i.exec(raw);
  const extracted = markdown?.[1] || raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  if (!extracted) return null;
  const [local, ...domainParts] = extracted.trim().split("@");
  const domain = domainParts.join("@").toLocaleLowerCase("en-US");
  if (!local || !domain) return null;
  const corrections: Record<string, string> = {
    gamil: "gmail.com", "gamil.com": "gmail.com", gmial: "gmail.com", "gmial.com": "gmail.com", gmai: "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com",
    "naver.con": "naver.com", "nver.com": "naver.com", "daum.ent": "daum.net", "hanmail.ent": "hanmail.net",
    hotmial: "hotmail", "yahoo.co": "yahoo.com",
  };
  const correctedDomain = corrections[domain] ?? domain;
  const email = `${local}@${correctedDomain}`;
  return { email, correctedFrom: email === extracted ? null : extracted };
}

function priceInDirective(value: string) {
  const found = findMoney(value);
  if (found) return found.amount;
  const bare = /(?:총\s*금액\s*)?(\d{1,4})(?:\s*으로)?/.exec(value);
  return bare ? moneyFromToken(bare[1], undefined) : null;
}

function deriveClientName(line: string) {
  return line
    .replace(/\s*견적서(?:를|을)?\s*(?:만들어줘|만들자|해줘|해주세요|부탁해)?\s*$/i, "")
    .replace(/\s*견적서\s*$/i, "")
    .trim() || null;
}

function eventSuffix(clientName: string | null, source: string) {
  if (!EVENT_PATTERN.test(source)) return null;
  const trimmed = source.replace(/\s*견적서.*$/i, "").trim();
  if (clientName && trimmed.startsWith(clientName)) return trimmed.slice(clientName.length).trim() || null;
  return trimmed || null;
}

export function parseQuoteRequest(text: string): ParsedQuoteRequest {
  const result: ParsedQuoteRequest = {
    clientName: null, titleSuffix: null, isEvent: false, contactName: null, phone: null, email: null,
    emailCorrectedFrom: null, items: [], discount: null, fixedTotal: null, roundDownUnit: null,
    memo: null, unparsedLines: [],
  };
  const meaningfulLines: string[] = [];

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = stripLeader(rawLine);
    if (!line) continue;
    meaningfulLines.push(line);

    const isDiscountDirective = /(?:\d+(?:\.\d+)?\s*%\s*할인|\d[\d,]*(?:만원|만|원)\s*할인)/.test(line);
    if (COMMAND_ENDING.test(line) || isDiscountDirective || /\d[\d,]*\s*원?\s*미만\s*절삭/.test(line)) {
      if (!result.clientName && /견적서/.test(line)) result.clientName = deriveClientName(line);
      const fixed = /총\s*금액/.test(line) ? priceInDirective(line) : null;
      if (fixed !== null) result.fixedTotal = fixed;
      const round = /(\d[\d,]*)\s*원?\s*미만\s*절삭/.exec(line);
      if (round) result.roundDownUnit = Number(round[1].replaceAll(",", ""));
      const percent = /(.*?)\s*(\d+(?:\.\d+)?)\s*%\s*할인/.exec(line);
      if (percent) result.discount = { label: percent[1].trim().replace(/(?:으로|로)$/, "") || null, type: "percent", value: Number(percent[2]) };
      else if (/할인/.test(line)) {
        const amount = priceInDirective(line);
        if (amount !== null) result.discount = { label: null, type: "amount", value: amount };
      }
      continue;
    }
    if (CONTENT_HEADING.test(line)) continue;
    if (PHONE.test(line)) {
      result.phone = line.replace(/\s/g, "");
      continue;
    }
    if (line.includes("@")) {
      const parsed = correctedEmail(line);
      if (parsed) {
        result.email = parsed.email;
        result.emailCorrectedFrom = parsed.correctedFrom;
        continue;
      }
    }
    const item = itemFromLine(line);
    if (item) {
      result.items.push(item);
      continue;
    }
    if (result.items.length > 0) {
      result.items[result.items.length - 1].details.push(line);
      continue;
    }
    if (CONTACT.test(line)) {
      result.contactName = line;
      continue;
    }
    if (!result.clientName) {
      result.clientName = deriveClientName(line);
      continue;
    }
    result.unparsedLines.push(line);
  }

  const source = meaningfulLines.join(" ");
  result.isEvent = EVENT_PATTERN.test(source) || result.items.some((item) => /스케치\s*촬영/.test(item.name));
  result.titleSuffix = result.isEvent ? eventSuffix(result.clientName, source) : null;
  return result;
}
