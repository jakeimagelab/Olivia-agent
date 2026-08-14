export type OliviaRuntimeContext = {
  nowISO: string;
  todayISO: string;
  localDateTime: string;
  localTime: string;
  weekdayKo: string;
  timezone: "Asia/Seoul";
};

export type TemporalResolution =
  | { kind: "date"; date: string; label: string }
  | { kind: "range"; start: string; end: string; label: string };
