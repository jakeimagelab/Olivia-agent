type QuoteDraftContent = {
  hospitalName?: unknown;
  items?: unknown;
  totalAmount?: unknown;
};

/** 날짜와 견적번호만 발급된 초기 폼은 실제 견적이 아니다. */
export function hasMeaningfulQuoteContent(value: QuoteDraftContent) {
  const hospitalName = typeof value.hospitalName === "string" ? value.hospitalName.trim() : "";
  const hasItems = Array.isArray(value.items) && value.items.length > 0;
  const totalAmount = Number(value.totalAmount);
  return Boolean(hospitalName || hasItems || (Number.isFinite(totalAmount) && totalAmount > 0));
}
