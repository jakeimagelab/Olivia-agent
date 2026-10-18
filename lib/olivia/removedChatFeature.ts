type RemovedFeature = {
  name: string;
  subject: RegExp;
  action: RegExp;
};

const OPEN_INTENT = /(열어|띄워|보여\s*줘|화면|페이지|이동)/;

const REMOVED_FEATURES: RemovedFeature[] = [
  { name: "콘티", subject: /(콘티|촬영\s*준비)/, action: /(만들|작성|추가|수정|삭제|정렬|복제|완료|예상)/ },
  { name: "메모", subject: /메모/, action: /(남겨|적어|기록|작성|추가|수정|삭제|검색|찾아)/ },
  { name: "업무일지", subject: /(업무\s*일지|업무일지)/, action: /(만들|작성|기록|완료|수정|검색|찾아)/ },
  { name: "업무", subject: /업무/, action: /(만들|등록|추가|완료|오늘|목록)/ },
  { name: "메일", subject: /(메일|이메일)/, action: /(검색|읽어|요약|초안|작성|발송|보내|큐)/ },
  { name: "회의·상담", subject: /(회의|상담|미팅)/, action: /(준비|브리프|완료|후속|분석|연결|목록)/ },
  { name: "브랜드 분석", subject: /(브랜드\s*분석|브랜드\s*진단)/, action: /(실행|돌려|분석|진단|최근|결과)/ },
  { name: "트렌드 분석", subject: /트렌드\s*분석/, action: /(실행|돌려|분석|최근|결과)/ },
  { name: "갤러리", subject: /갤러리/, action: /(만들|생성|조회|가져|열람)/ },
  { name: "작업 세션", subject: /(작업\s*세션|태스크\s*세션)/, action: /(시작|계속|이어|중지|일시\s*정지|상태)/ },
  { name: "오늘 브리핑", subject: /(오늘\s*브리핑|긴급\s*인사이트)/, action: /(알려|보여|조회|요약|해\s*줘)/ },
];

/** Removed tools stay available in their screens, but are never routed to a chat model. */
export function resolveRemovedChatFeatureNotice(message: string): string | null {
  const text = message.trim();
  if (!text || OPEN_INTENT.test(text)) return null;
  const feature = REMOVED_FEATURES.find((candidate) => candidate.subject.test(text) && candidate.action.test(text));
  return feature
    ? `이 기능은 채팅에서 쓰지 않아요. 화면에서 '${feature.name}'을 열어 사용해 주세요.`
    : null;
}
