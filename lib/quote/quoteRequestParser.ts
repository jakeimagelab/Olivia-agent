import { jakeimageSingleItems, packageOptions, packages, singleItems } from "@/lib/quote/quoteCatalog";

/** The parser keeps the user's words separate from the catalog slot used to price or display them. */
export type ParsedQuoteItem = {
  name: string;
  note: string | null;
  details: string[];
  amount: number | null;
  quantity: number;
  free: boolean;
  groupLabel: string | null;
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
  checkTotal: number | null;
  /** Existing payment-term support stays explicit; it is unrelated to quote parsing defaults. */
  depositRate: number | null;
  memo: string | null;
  unparsedLines: string[];
};

type CatalogEntry = { id: string; name: string; price: number; package?: boolean };

const EVENT_PATTERN = /(행사|이벤트|기념|주년|세미나|학회|심포지엄|학술대회|개원식|창립|워크숍|오픈식|웨딩|결혼|예식|돌잔치|돌|환갑|칠순|고희|약혼|상견례|졸업|입학)/i;
const EVENT_TOKEN = /(행사|이벤트|기념|주년|세미나|학회|심포지엄|학술대회|개원식|창립|워크숍|오픈식|웨딩|결혼|예식|돌잔치|돌|환갑|칠순|고희|약혼|상견례|졸업|입학)/i;
const CONTENT_HEADING = /^(?:내용은?|아래와\s*같이|다음과\s*같이)$/;
const PHONE = /^0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}$/;
const CONTACT = /^(?=.{2,20}$)[가-힣A-Za-z][가-힣A-Za-z\s]*(?:대표|원장|팀장|실장|매니저|담당자|이사|부장|과장)?님$/;
const EXTERNAL_ITEM = /(헤어\s*메이크업|메이크업|헤메|모델\s*섭외|모델료|섭외|외주)/i;
const QUANTITY_UNIT = "개장점벌세트부본";
const CATALOG: CatalogEntry[] = [
  ...packages.map((entry) => ({ ...entry, package: true })),
  ...singleItems,
  ...packageOptions,
  ...jakeimageSingleItems,
];

function normalized(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s_\-]+/g, "");
}

function stripLeader(value: string) {
  let line = value.trim();
  let before = "";
  while (line !== before) {
    before = line;
    line = line.replace(/^(?:[*•\-·>]+)\s*/, "");
    line = line.replace(/^(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/, "");
    line = line.replace(/^(?:내용은?|아래와\s*같이|다음과\s*같이)\s*/, "");
    line = line.trimStart();
  }
  return line.trim();
}

function withoutCommandPunctuation(value: string) {
  return value.trim().replace(/[요!?.~…^\s]+$/u, "").trim();
}

function isCreateCommand(value: string) {
  const line = withoutCommandPunctuation(value);
  return /(만들어줘|만들어|만들자|해줘|해주세요|부탁해|부탁드려|줘|결정|적용)/u.test(line);
}

function isInstruction(value: string) {
  return isCreateCommand(value)
    || /(?:할인|절삭|총\s*(?:금액|액|촬영|합계|\d)|합계|잔금|계약금|선금)/.test(value);
}

function moneyFromToken(raw: string, unit: string | undefined) {
  const numeric = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return null;
  if (unit === "원") return Math.round(numeric);
  return Math.round(numeric * 10_000);
}

type Money = { amount: number; start: number; end: number; raw: string };

function moneyMatches(line: string): Money[] {
  const explicit = /(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원)/g;
  return [...line.matchAll(explicit)].flatMap((match) => {
    const amount = moneyFromToken(match[1], match[2]);
    if (amount === null || match.index === undefined) return [];
    return [{ amount, start: match.index, end: match.index + match[0].length, raw: match[0] }];
  });
}

function findMoney(line: string): Money | null {
  const explicit = moneyMatches(line);
  if (explicit.length) return explicit[explicit.length - 1];
  const bare = /(?:^|\s)(\d{1,4})\s*$/.exec(line);
  if (!bare || bare.index === undefined) return null;
  const amount = moneyFromToken(bare[1], undefined);
  return amount === null ? null : {
    amount,
    start: bare.index + bare[0].indexOf(bare[1]),
    end: bare.index + bare[0].length,
    raw: bare[1],
  };
}

function catalogMatch(line: string): CatalogEntry | null {
  const source = normalized(line).replace(/서비스|무료|무상/g, "");
  const matches = CATALOG
    .filter((entry) => normalized(entry.name).length >= 3 && source.includes(normalized(entry.name)))
    .sort((left, right) => normalized(right.name).length - normalized(left.name).length);
  return matches[0] ?? null;
}

function cataloguePersonAddition(line: string) {
  const match = /(?:의료진\s*)?프로필\s*(\d+)\s*(?:명|인)?\s*추가/.exec(line);
  if (!match) return null;
  return { quantity: Math.max(1, Number(match[1]) || 1), amount: 250_000 };
}

function noteAfterAmount(value: string) {
  const match = /^\(([^()]*)\)/.exec(value.trim());
  return match?.[1].trim() || null;
}

function normalItem(input: { name: string; note?: string | null; amount: number | null; quantity?: number; free?: boolean; groupLabel: string | null }): ParsedQuoteItem | null {
  const name = input.name.trim();
  if (!name) return null;
  return {
    name,
    note: input.note ?? null,
    details: [],
    amount: input.free ? 0 : input.amount,
    quantity: Math.max(1, input.quantity ?? 1),
    free: Boolean(input.free),
    groupLabel: input.groupLabel,
  };
}

/** Quantity is parsed only from `x N` or `N개 = 개당 ...`, never from prose such as 3회 방문. */
function itemFromLine(line: string, groupLabel: string | null): ParsedQuoteItem | null {
  const free = /(?:서비스|무료|무상)\s*$/i.test(line);
  const withoutFree = line.replace(/\s*(?:서비스|무료|무상)\s*$/i, "").trim();

  const each = new RegExp(`^(.*?)\\s+(\\d+)\\s*([${QUANTITY_UNIT}])\\s*=\\s*(?:개당|장당|점당|1개당|각|each)\\s*([\\d,.]+)\\s*(만원|만|원)$`, "i").exec(withoutFree);
  if (each) {
    const amount = moneyFromToken(each[4], each[5]);
    return normalItem({ name: each[1], amount, quantity: Number(each[2]), free, groupLabel });
  }

  const multiplied = /(?:×|x)\s*(\d+)/i.exec(withoutFree);
  const withoutMultiplier = multiplied ? withoutFree.replace(/\s*(?:×|x)\s*\d+/i, " ").trim() : withoutFree;
  const money = findMoney(withoutMultiplier);
  if (money) {
    const name = withoutMultiplier.slice(0, money.start).trim();
    const tail = withoutMultiplier.slice(money.end).trim();
    return normalItem({ name, note: noteAfterAmount(tail), amount: money.amount, quantity: multiplied ? Number(multiplied[1]) : 1, free, groupLabel });
  }

  const addition = cataloguePersonAddition(withoutFree);
  if (addition) return normalItem({ name: withoutFree, amount: addition.amount, quantity: addition.quantity, free, groupLabel });
  const catalog = catalogMatch(withoutFree);
  if (catalog) return normalItem({ name: withoutFree, amount: catalog.price, free, groupLabel });
  if (free || EXTERNAL_ITEM.test(withoutFree)) return normalItem({ name: withoutFree, amount: null, free, groupLabel });
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
    hotmial: "hotmail", "hotmial.com": "hotmail.com", "yahoo.co": "yahoo.com",
  };
  const correctedDomain = corrections[domain] ?? domain;
  const email = `${local}@${correctedDomain}`;
  return { email, correctedFrom: email === extracted ? null : extracted };
}

function validClientCandidate(value: string) {
  const candidate = value.trim().replace(/\s*견적서\s*$/i, "").trim();
  return candidate.length >= 2 && /[가-힣A-Za-z0-9]/.test(candidate) ? candidate : null;
}

function titleDataFromClientLine(line: string) {
  const withoutQuote = line.replace(/\s*견적서\s*$/i, "").trim();
  const event = EVENT_TOKEN.exec(withoutQuote);
  if (!event || !/견적서\s*$/i.test(line)) return null;
  const client = validClientCandidate(withoutQuote.slice(0, event.index));
  const suffix = withoutQuote.slice(event.index).trim();
  return client && suffix ? { client, suffix } : null;
}

function parseDirective(line: string, result: ParsedQuoteRequest) {
  const roundDown = /(\d[\d,]*)\s*원?\s*미만\s*절삭/.exec(line);
  if (roundDown) result.roundDownUnit = Number(roundDown[1].replaceAll(",", ""));
  if (/만원\s*미만\s*절삭/.test(line)) result.roundDownUnit = 10_000;

  const deposit = /(?:선금|계약금)(?:은|이)?\s*(\d+(?:\.\d+)?)\s*%/.exec(line);
  const balance = /잔금(?:은|이)?\s*(\d+(?:\.\d+)?)\s*%/.exec(line);
  if (deposit) result.depositRate = Number(deposit[1]);
  if (balance) result.depositRate = 100 - Number(balance[1]);

  const amounts = moneyMatches(line);
  const percent = /(.*?)\s*(\d+(?:\.\d+)?)\s*%\s*할인/.exec(line);
  const fixed = /총\s*금액\s*([^\n]*?)\s*(?:으로\s*)?결정/.exec(line);
  if (fixed) {
    const price = findMoney(fixed[1]);
    if (price) result.fixedTotal = price.amount;
  }

  if (percent) {
    result.discount = { label: percent[1].trim().replace(/(?:으로|로)$/, "") || null, type: "percent", value: Number(percent[2]) };
  } else {
    const amountDiscount = /^(.*?)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원)\s*할인/.exec(line);
    if (amountDiscount) {
      const value = moneyFromToken(amountDiscount[2], amountDiscount[3]);
      if (value !== null) result.discount = { label: amountDiscount[1].trim() || null, type: "amount", value };
    }
  }

  if (/(?:총\s*(?:금액|액|촬영|합계|\d)|합계)/.test(line) && !fixed) {
    // In an instruction with discount + result, the last amount is the check total, never another discount.
    const total = amounts[amounts.length - 1];
    if (total) result.checkTotal = total.amount;
  }
}

function isPaidItemLine(line: string) {
  return Boolean(findMoney(line) || catalogMatch(line));
}

export function parseQuoteRequest(text: string): ParsedQuoteRequest {
  const result: ParsedQuoteRequest = {
    clientName: null, titleSuffix: null, isEvent: false, contactName: null, phone: null, email: null,
    emailCorrectedFrom: null, items: [], discount: null, fixedTotal: null, roundDownUnit: null, checkTotal: null,
    depositRate: null, memo: null, unparsedLines: [],
  };
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(stripLeader).filter(Boolean);
  let groupLabel: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1];

    // Commands are instructions, never clients. Their remaining fragments are intentionally discarded.
    if (isInstruction(line)) {
      parseDirective(line, result);
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

    const item = itemFromLine(line, groupLabel);
    if (item) {
      result.items.push(item);
      continue;
    }
    if (CONTACT.test(line)) {
      result.contactName = line;
      continue;
    }
    // Before the first item an amountless line is the customer/title candidate, not a group
    // heading. This prevents `양재선변호사님(민정님) 웨딩촬영 ... 견적서` from becoming
    // an "액자 추가 건" style grouping label simply because the next line has a price.
    if (!result.clientName && result.items.length === 0) {
      const eventTitle = titleDataFromClientLine(line);
      if (eventTitle) {
        result.clientName = eventTitle.client;
        result.titleSuffix = eventTitle.suffix;
        result.isEvent = true;
        continue;
      }
      const candidate = validClientCandidate(line);
      if (candidate) {
        result.clientName = candidate;
        continue;
      }
    }
    if (!/^\d+\s*회/.test(line) && !findMoney(line) && nextLine && !isInstruction(nextLine) && isPaidItemLine(nextLine)) {
      groupLabel = line;
      continue;
    }
    if (result.items.length > 0) {
      result.items[result.items.length - 1].details.push(line);
      continue;
    }
    result.unparsedLines.push(line);
  }

  const source = lines.join(" ");
  result.isEvent = result.isEvent || EVENT_PATTERN.test(source) || result.items.some((item) => /스케치\s*촬영/.test(item.name));
  return result;
}

export function quoteCreationTargetFromRequest(text: string): string | null {
  const request = parseQuoteRequest(text);
  return request.clientName && request.items.length > 0 ? request.clientName : null;
}
