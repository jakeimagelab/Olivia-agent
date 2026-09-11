export type QuoteRailNameSize = "default" | "compact" | "tight";

const visualLength = (value: string) =>
  Array.from(value.trim()).reduce((length, character) => {
    if (/\s/.test(character)) return length + 0.35;
    if (/^[\u0000-\u00ff]$/.test(character)) return length + 0.58;
    return length + 1;
  }, 0);

export const getQuoteRailNameSize = (hospitalName: string): QuoteRailNameSize => {
  const length = visualLength(hospitalName);
  if (length > 10) return "tight";
  if (length > 7) return "compact";
  return "default";
};
