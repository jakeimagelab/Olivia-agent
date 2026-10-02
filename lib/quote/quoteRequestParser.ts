import { jakeimageSingleItems, packageOptions, packages, singleItems } from "@/lib/quote/quoteCatalog";

export type ParsedQuoteItem = {
  name: string;
  note: string | null;
  details: string[];
  amount: number | null;
  quantity: number;
  free: boolean;
  /** 서비스/혜택 묶음에 사용자가 적은 안내 항목. 정가·서비스 문구를 덧붙이지 않는다. */
  benefitOnly?: boolean;
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
  /** null이면 기존 기본 결제조건을 유지하고, 0은 잔금 100%라는 명시적 값이다. */
  depositRate: number | null;
  memo: string | null;
  unparsedLines: string[];
};

type CatalogEntry = { id: string; name: string; price: number; package?: boolean };

const EVENT_PATTERN = /(행사|이벤트|기념|주년|세미나|학회|심포지엄|학술대회|개원식|창립|워크숍|오픈식)/i;
const COMMAND_ENDING = /(?:만들어줘|만들자|해줘|해주세요|부탁해|결정|적용)(?:[.!…]+)?\s*$/;
// 채팅에서는 "견적서 만들어줘, 행사명…"처럼 생성 지시와 원문을 같은 줄에 적는
// 경우가 많다. 이 지시는 고객명/행사명보다 먼저 제거해야 한다.
const LEADING_QUOTE_REQUEST = /^견적서\s*(?:하나|한\s*개|좀)?\s*(?:를|을)?\s*(?:만들어줘|만들자|해줘|해주세요|부탁해)\s*(?:[,，:：.!…\-–—]\s*)?/i;
const CONTENT_HEADING = /^(?:내용은?|아래와 같이|다음과 같이)$/;
const BENEFIT_HEADING = /^서비스s*(?:\/|및)?s*혜택$/;
const GENERIC_QUOTE_REQUEST = /^견적서\s*(?:하나|한\s*개|좀)?\s*(?:만들어줘|만들자|해줘|해주세요|부탁해)(?:[.!…]+)?\s*$/;
const TOTAL_AMOUNT_DIRECTIVE = /^(?:총\s*금액|총액|합계)(?:\s*(?:은|이|는|:|：))?\s*/;
const PHONE = /^0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}$/;
const CONTACT = /^[^\n]{1,20}(?:[가-힣]{2,}|[A-Za-z]{2,})(?:\s*(?:대표|원장|팀장|실장|매니저|담당자|이사|부장|과장))?님$/;
const EXTERNAL_ITEM = /(헤어\s*메이크업|메이크업|헤메|모델\s*섭외|모델료|섭외|푸드\s*스타일링|재료\s*구입)/i;
const WORK_SCOPE = /(촬영|스케치|영상|콘텐츠|행사|이벤트|세미나|학회|프로필|인테리어|브랜드필름)/i;

const CATALOG: CatalogEntry[] = [
  ...packages.map((entry) => ({ ...entry, package: true })),
  ...singleItems,
  ...packageOptions,
  ...jakeimageSingleItems,
];

function normalized(value: string) {
  return value.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s_\-]+/g, "");
}

/**
 * 사용자는 연결어·번호·불릿을 한 줄에 겹쳐 쓴다. 항목명과 설명 모두에서 같은
 * 규칙으로, 더 이상 뗄 것이 없을 때까지 앞부분만 반복 제거한다.
 */
function stripLeader(line: string) {
  let rest = line;
  let previous = "";
  while (rest !== previous) {
    previous = rest;
    rest = rest.replace(/^\s+/, "");
    rest = rest.replace(/^(?:[*•\-·>]+)\s*/, "");
    rest = rest.replace(/^(?:\d+[.)]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*/, "");
    rest = rest.replace(/^(?:내용은|내용|아래와\s*같이|아래는|다음과\s*같이)\s*/, "");
  }
  return rest.trim();
}

function stripLeadingQuoteRequest(line: string) {
  return line.replace(LEADING_QUOTE_REQUEST, "").trim();
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
    // 사람이 쓴 항목명은 보존한다. 수량/카탈로그 단가만 구조화하며, 임의로 "프로필 인원
    // 추가"처럼 다시 이름 붙이지 않는다.
    return { name: withoutFree, note: null, details: [], amount: free ? 0 : 250000, quantity: count, free };
  }
  const entry = catalogMatch(withoutFree);
  // 카탈로그는 가격을 찾는 데만 쓴다. 결과 name은 언제나 사용자가 적은 원문이다.
  if (entry) return { name: withoutFree, note: null, details: [], amount: free ? 0 : entry.price, quantity, free };
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
    hotmial: "hotmail", "hotmial.com": "hotmail.com", "yahoo.co": "yahoo.com",
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
  return stripLeadingQuoteRequest(line)
    .replace(/\s*견적서(?:를|을)?\s*(?:만들어줘|만들자|해줘|해주세요|부탁해)?\s*$/i, "")
    .replace(/\s*견적서\s*$/i, "")
    .trim() || null;
}

/**
 * 총액만 제시된 행사 견적에서는 "행사스케치 15:30 - 20:30" 같은 작업 범위가
 * 금액 없이 먼저 올 수 있다. 이 범위는 총액이 이어질 때만 실제 견적 항목이 된다.
 * 고객명/행사 제목을 항목으로 오인하지 않도록 촬영 관련 단어가 있는 줄만 받는다.
 */
function unpricedWorkScopeFromLine(line: string): ParsedQuoteItem | null {
  if (!WORK_SCOPE.test(line)) return null;
  const timeRange = /\b\d{1,2}:\d{2}\s*(?:[-~–—]\s*)\d{1,2}:\d{2}\b/.exec(line);
  const name = timeRange
    ? line.replace(timeRange[0], "").replace(/[|,·•\-–—]+\s*$/, "").trim()
    : line.trim();
  if (!name) return null;
  return {
    name,
    note: null,
    details: timeRange ? [`촬영 시간 ${timeRange[0]}`] : [],
    amount: null,
    quantity: 1,
    free: false,
  };
}

function applyTotalToSingleUnpricedScope(result: ParsedQuoteRequest, total: number) {
  const unpricedScopes = result.items.filter((item) => !item.free && item.amount === null);
  // 여러 작업 범위의 합계라면 어느 하나에 임의 배분하지 않고, 기존 총액 조정 로직으로
  // 넘긴다. 단일 범위만 있을 때는 그 범위의 견적 금액으로 확정할 수 있다.
  if (unpricedScopes.length === 1) {
    unpricedScopes[0].amount = total;
    return;
  }
  result.fixedTotal = total;
}

function eventSuffix(clientName: string | null, source: string) {
  if (!EVENT_PATTERN.test(source)) return null;
  const trimmed = source.replace(/\s*견적서.*$/i, "").trim();
  if (clientName && trimmed.startsWith(clientName)) return trimmed.slice(clientName.length).trim() || null;
  return trimmed || null;
}

function roundDownUnitFromDirective(line: string) {
  const numbered = /(\d[\d,]*)\s*원?\s*미만\s*절삭/.exec(line);
  if (numbered) return Number(numbered[1].replaceAll(",", ""));
  // "만원"은 임의 기본값이 아니라 10,000원을 뜻하는 사용자의 명시적 단위 표현이다.
  return /만원\s*미만\s*절삭/.test(line) ? 10_000 : null;
}

function depositRateFromDirective(line: string) {
  const balance = /잔금(?:은|이)?\s*(\d+(?:\.\d+)?)\s*%\s*(?:로\s*)?(?:진행|기준)?/.exec(line);
  if (balance) return 100 - Number(balance[1]);
  const deposit = /(?:선금|계약금)(?:은|이)?\s*(\d+(?:\.\d+)?)\s*%\s*(?:로\s*)?(?:진행|기준)?/.exec(line);
  return deposit ? Number(deposit[1]) : null;
}

function perPersonTotalFromLine(line: string): { perPersonLabel: string; totalAmount: number } | null {
  const match = /^인당\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원)\s*(?:으로|로)?\s*총\s*금액\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만원|만|원)\s*$/.exec(line);
  if (!match) return null;
  const totalAmount = moneyFromToken(match[3], match[4]);
  if (totalAmount === null) return null;
  return { perPersonLabel: `인당 ${match[1]}${match[2]}으로 책정`, totalAmount };
}

function applyPerPersonTotal(item: ParsedQuoteItem, pricing: { perPersonLabel: string; totalAmount: number }) {
  // "프로필 및 연출촬영 + 인당 ... 총금액 ..."은 둘을 따로 산정하는 카탈로그 항목이 아니라,
  // 사용자가 총액으로 정한 의료진 촬영 한 건이다. 이 형식에서만 화면 표기를 연출/프로필로 통일한다.
  if (/프로필/.test(item.name) && /연출\s*촬영/.test(item.name)) item.name = "연출/프로필";
  item.amount = pricing.totalAmount;
  item.quantity = 1;
  item.details.push(pricing.perPersonLabel);
}

function serviceBenefitFromLine(line: string): ParsedQuoteItem {
  const percent = /^(\d+(?:\.\d+)?)\s*%\s*할인$/.exec(line);
  const name = percent
    ? `${percent[1]}% 금액할인`
    : line.replace(/헤어\s*메이크업\s*포함/g, "헤어메이크업 포함");
  return { name, note: null, details: [], amount: 0, quantity: 1, free: true, benefitOnly: true };
}

export function parseQuoteRequest(text: string): ParsedQuoteRequest {
  const result: ParsedQuoteRequest = {
    clientName: null, titleSuffix: null, isEvent: false, contactName: null, phone: null, email: null,
    emailCorrectedFrom: null, items: [], discount: null, fixedTotal: null, roundDownUnit: null, depositRate: null,
    memo: null, unparsedLines: [],
  };
  const meaningfulLines: string[] = [];
  let inBenefitSection = false;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = stripLeadingQuoteRequest(stripLeader(rawLine));
    if (!line) continue;
    meaningfulLines.push(line);

    if (BENEFIT_HEADING.test(line)) {
      inBenefitSection = true;
      continue;
    }
    const perPersonTotal = perPersonTotalFromLine(line);
    if (perPersonTotal && result.items.length > 0) {
      applyPerPersonTotal(result.items[result.items.length - 1], perPersonTotal);
      continue;
    }
    if (TOTAL_AMOUNT_DIRECTIVE.test(line)) {
      const total = priceInDirective(line);
      if (total !== null) applyTotalToSingleUnpricedScope(result, total);
      continue;
    }
    // 서비스/혜택 아래의 할인은 혜택 문구로도 남기되, 실제 할인율도 함께 적용한다.
    // 이후 생성 지시는 혜택으로 오인하지 않도록 지시줄 판정보다 먼저 넓히지 않는다.
    if (inBenefitSection && !COMMAND_ENDING.test(line)) {
      const benefit = serviceBenefitFromLine(line);
      result.items.push(benefit);
      const percent = /^(\d+(?:\.\d+)?)\s*%\s*할인$/.exec(line);
      if (percent) result.discount = { label: null, type: "percent", value: Number(percent[1]) };
      continue;
    }
    const isDiscountDirective = /(?:\d+(?:\.\d+)?\s*%\s*할인|\d[\d,]*(?:만원|만|원)\s*할인)/.test(line);
    const roundDownUnit = roundDownUnitFromDirective(line);
    const depositRate = depositRateFromDirective(line);
    if (COMMAND_ENDING.test(line) || isDiscountDirective || roundDownUnit !== null || depositRate !== null) {
      // "견적서 하나 만들어줘"는 작업 지시이지 고객명이 아니다. 실제 고객명이 함께
      // 적힌 "강남스마트치과의원 견적서 만들어줘"만 여기서 고객명으로 읽는다.
      if (!result.clientName && /견적서/.test(line) && !GENERIC_QUOTE_REQUEST.test(line)) result.clientName = deriveClientName(line);
      const fixed = /총\s*금액/.test(line) ? priceInDirective(line) : null;
      if (fixed !== null) result.fixedTotal = fixed;
      if (roundDownUnit !== null) result.roundDownUnit = roundDownUnit;
      if (depositRate !== null && Number.isFinite(depositRate) && depositRate >= 0 && depositRate <= 100) result.depositRate = depositRate;
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
    // 기존 항목에 딸린 설명("메뉴촬영, 단품촬영…")을 새 항목으로 만들지 않는다.
    // 고객이 먼저 확정되고 아직 항목이 하나도 없을 때의 첫 작업 범위만 받는다.
    const workScope = result.clientName && result.items.length === 0
      ? unpricedWorkScopeFromLine(line)
      : null;
    if (workScope) {
      result.items.push(workScope);
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
  const eventLine = meaningfulLines.find((line) => EVENT_PATTERN.test(line));
  result.isEvent = EVENT_PATTERN.test(source) || result.items.some((item) => /스케치\s*촬영/.test(item.name));
  // 행사 제목은 사용자가 행사라고 적은 그 줄만 쓴다. 뒤의 담당자·항목 설명을 제목에
  // 덧붙여 고쳐 읽지 않는다.
  result.titleSuffix = result.isEvent ? eventSuffix(result.clientName, eventLine || source) : null;
  return result;
}

/**
 * 여러 줄 견적 원문에서 이미 확인된 고객명을 돌려준다. 채팅의 화면 선택이나 추정값을
 * 쓰지 않고, 원문에 고객명과 적어도 한 항목이 함께 있을 때만 유효한 생성 대상으로 본다.
 */
export function quoteCreationTargetFromRequest(text: string): string | null {
  const request = parseQuoteRequest(text);
  return request.clientName && request.items.length > 0 ? request.clientName : null;
}
