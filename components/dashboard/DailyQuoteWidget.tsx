import { Quote, User } from "lucide-react";

/* 대시보드 홈에 쓰던 "오늘의 명언" 위젯 — 예전 app/page.tsx의 Dashboard에 있던 걸
   그대로 옮겨왔다(외부 API 없이 날짜 기준으로 매일 자동으로 바뀐다). */
export const DAILY_QUOTES: { text: string; author: string }[] = [
  { text: "성공은 최종적인 것이 아니고, 실패는 치명적인 것이 아니다. 중요한 것은 계속할 수 있는 용기다.", author: "윈스턴 처칠" },
  { text: "당신의 시간은 한정되어 있다. 그러니 다른 사람의 삶을 사느라 시간을 낭비하지 마라.", author: "스티브 잡스" },
  { text: "어제로부터 배우고, 오늘을 살고, 내일을 희망하라. 중요한 것은 질문을 멈추지 않는 것이다.", author: "알베르트 아인슈타인" },
  { text: "가장 위대한 영광은 한 번도 넘어지지 않는 것이 아니라, 넘어질 때마다 다시 일어나는 데 있다.", author: "넬슨 만델라" },
  { text: "꿈꿀 수 있다면 이룰 수 있다.", author: "월트 디즈니" },
  { text: "사람들은 당신이 한 말은 잊어도, 당신이 준 느낌은 잊지 않는다.", author: "마야 안젤루" },
  { text: "할 수 있다고 믿든 할 수 없다고 믿든, 당신 생각이 옳다.", author: "헨리 포드" },
  { text: "세상에서 보고 싶은 변화가 있다면, 당신 자신이 그 변화가 되어라.", author: "마하트마 간디" },
  { text: "가야 할 길이 아무리 느리더라도, 멈추지만 않는다면 상관없다.", author: "공자" },
  { text: "우리가 반복적으로 하는 행동이 바로 우리 자신이다. 그러므로 탁월함은 행위가 아니라 습관이다.", author: "아리스토텔레스" },
  { text: "나는 실패한 적이 없다. 단지 작동하지 않는 만 가지 방법을 발견했을 뿐이다.", author: "토머스 에디슨" },
  { text: "미래는 자신의 꿈의 아름다움을 믿는 사람들의 것이다.", author: "엘리너 루스벨트" },
  { text: "어둠은 어둠을 몰아낼 수 없다. 오직 빛만이 그것을 할 수 있다.", author: "마틴 루터 킹" },
  { text: "인생에서 두려워할 것은 없다. 다만 이해해야 할 것이 있을 뿐이다.", author: "마리 퀴리" },
  { text: "위대한 일은 충동이 아니라, 작은 일들이 모여서 이루어진다.", author: "빈센트 반 고흐" },
  { text: "성공이란 자주, 그리고 많이 웃는 것이다.", author: "랄프 왈도 에머슨" },
  { text: "투자는 지식에 대한 것일 때 가장 큰 이자를 돌려준다.", author: "벤저민 프랭클린" },
  { text: "너무 조심스럽게 살아서 아무것도 실패하지 않는다면, 그것 자체가 실패한 삶이다.", author: "조앤 K. 롤링" },
  { text: "불가능, 그것은 아무것도 아니다.", author: "무하마드 알리" },
  { text: "무언가가 충분히 중요하다면, 확률이 자신에게 불리하더라도 해야 한다.", author: "일론 머스크" },
  { text: "명성을 쌓는 데는 20년이 걸리지만, 무너뜨리는 데는 5분이면 충분하다.", author: "워런 버핏" },
  { text: "미래를 예측하는 가장 좋은 방법은 미래를 창조하는 것이다.", author: "피터 드러커" },
  { text: "천 리 길도 한 걸음부터.", author: "노자" },
  { text: "행복은 나눈다고 줄어들지 않는다.", author: "석가모니" },
  { text: "나는 내가 아무것도 모른다는 것을 안다.", author: "소크라테스" },
  { text: "온 세상은 무대이고, 모든 남녀는 배우일 뿐이다.", author: "윌리엄 셰익스피어" },
  { text: "아름다운 눈을 가지고 싶다면 다른 사람에게서 좋은 점을 찾아라.", author: "오드리 헵번" },
  { text: "세상을 개선하는 데 단 한 순간도 기다릴 필요가 없다는 것, 이 얼마나 멋진 일인가.", author: "안네 프랑크" },
  { text: "한 명의 아이, 한 명의 선생님, 한 자루의 펜, 한 권의 책이 세상을 바꿀 수 있다.", author: "말랄라 유사프자이" },
  { text: "지능은 변화에 적응하는 능력이다.", author: "스티븐 호킹" },
  { text: "살아남는 종은 가장 강한 종이 아니라, 변화에 가장 잘 적응하는 종이다.", author: "찰스 다윈" },
  { text: "마음이 품고 믿을 수 있는 것은 무엇이든 이룰 수 있다.", author: "나폴레온 힐" },
  { text: "성공은 자신이 하는 일을 사랑하는 데서 온다.", author: "데일 카네기" },
  { text: "사람들은 당신이 무엇을 하는지가 아니라, 왜 그것을 하는지에 대해 산다.", author: "사이먼 시넥" },
  { text: "기회는 버스와 같다. 늘 또 다른 것이 온다.", author: "리처드 브랜슨" },
  { text: "나는 농구 인생에서 9000번 넘게 슛을 놓쳤다. 그래서 나는 성공한다.", author: "마이클 조던" },
  { text: "재능이 노력하지 않을 때, 노력이 재능을 이긴다.", author: "코비 브라이언트" },
  { text: "대체 불가능한 사람이 되려면, 항상 남달라야 한다.", author: "코코 샤넬" },
  { text: "삶의 의미는 자신의 재능을 찾는 것이고, 삶의 목적은 그것을 나누어 주는 것이다.", author: "파블로 피카소" },
  { text: "혼자서는 아주 적은 일을 할 수 있지만, 함께라면 많은 것을 할 수 있다.", author: "헬렌 켈러" },
  { text: "우리의 삶은 우리가 하는 생각에 의해 만들어진다.", author: "마르쿠스 아우렐리우스" },
  { text: "행운은 준비가 기회를 만날 때 생긴다.", author: "세네카" },
  { text: "단순함이야말로 최고의 정교함이다.", author: "레오나르도 다빈치" },
  { text: "미래에는 여러 이름이 있다. 약한 자에게는 불가능이고, 소심한 자에게는 미지수며, 용감한 자에게는 기회다.", author: "빅토르 위고" },
  { text: "나를 죽이지 못하는 것은 나를 더 강하게 만든다.", author: "프리드리히 니체" },
  { text: "지금부터 20년 후, 당신은 한 일보다 하지 않은 일 때문에 더 실망할 것이다.", author: "마크 트웨인" },
  { text: "가장 큰 모험은 당신이 꿈꾸는 삶을 사는 것이다.", author: "오프라 윈프리" },
  { text: "성공을 축하하는 것도 좋지만, 실패에서 얻는 교훈에 더 주목하는 것이 중요하다.", author: "빌 게이츠" },
  { text: "중요한 것은 비판하는 사람이 아니라, 실제로 경기장 안에 서 있는 사람이다.", author: "시어도어 루스벨트" },
];

export function todaysQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
  return DAILY_QUOTES[dayOfYear % DAILY_QUOTES.length];
}

export default function DailyQuoteWidget() {
  const quote = todaysQuote();
  return (
    <aside className="oa-daily-quote">
      <div className="oa-daily-quote__label">
        <Quote size={13} aria-hidden="true"/>
        <span>오늘의 명언</span>
      </div>
      <div className="oa-daily-quote__portrait" aria-hidden="true">
        <User size={22} strokeWidth={1.4} color="rgba(255,255,255,.7)"/>
      </div>
      <blockquote>“{quote.text}”</blockquote>
      <cite>— {quote.author}</cite>
    </aside>
  );
}
