export const TOTAL_STEPS = 10;

export const Q1_OPTIONS = [
  { value: "개원예정", label: "곧 개원 예정", sub: "개원 전 홈페이지·플레이스·홍보 이미지가 필요해요" },
  { value: "신규오픈", label: "신규 오픈 직후", sub: "초기 브랜드 이미지를 빠르게 정리하고 싶어요" },
  { value: "리뉴얼", label: "이미 운영 중 / 리뉴얼 필요", sub: "오래된 사진과 홈페이지 이미지를 바꾸고 싶어요" },
  { value: "정기관리", label: "정기적인 콘텐츠 관리가 필요", sub: "SNS·블로그·광고용 콘텐츠가 계속 필요해요" },
  { value: "촬영만", label: "촬영만 필요", sub: "필요한 사진 항목이 어느 정도 정해져 있어요" },
] as const;

export const Q2_OPTIONS = [
  { value: "전문성부족", label: "병원이 전문적으로 보이지 않는다" },
  { value: "사진노후", label: "홈페이지/플레이스 사진이 오래됐다" },
  { value: "의료진신뢰", label: "원장님과 의료진의 신뢰감이 부족해 보인다" },
  { value: "공간매력부족", label: "공간은 좋은데 사진에서 매력이 안 산다" },
  { value: "콘텐츠부족", label: "SNS나 블로그에 쓸 콘텐츠가 부족하다" },
  { value: "홈페이지부조화", label: "사진 톤이 홈페이지와 어울리지 않는다" },
  { value: "AI검색대비", label: "AI 검색·포털 노출에 맞는 이미지가 필요하다" },
  { value: "기타", label: "기타" },
] as const;

export const Q3_OPTIONS = [
  "피부과", "성형외과", "치과", "안과", "정형외과", "신경외과",
  "마취통증의학과", "한방병원·한의원", "검진내과", "산부인과", "정신건강의학과", "병원급",
] as const;

export const Q4_OPTIONS = [
  { value: "홈페이지", label: "홈페이지" },
  { value: "네이버플레이스", label: "네이버 플레이스" },
  { value: "블로그SNS", label: "블로그 / SNS" },
  { value: "광고랜딩", label: "광고 랜딩페이지" },
  { value: "병원내부사인", label: "병원 내부 사인" },
  { value: "브로슈어", label: "브로슈어 / 소개서" },
  { value: "AI검색콘텐츠", label: "AI 검색 대응 콘텐츠" },
] as const;

export const Q5_OPTIONS = [
  "프리미엄·럭셔리", "신뢰감·전문성", "따뜻함·편안함", "모던·미니멀",
  "트렌디·감각적", "친근함·캐주얼", "자연·내추럴", "권위·정통",
] as const;

export const Q6_OPTIONS = [
  "의료진 프로필", "의료진 단체사진", "인테리어·분위기", "진료연출", "브랜드영상",
  "홈페이지 제작", "블로그·SNS 콘텐츠", "언론홍보", "기타요청",
] as const;

export const Q7_OPTIONS = [
  { value: "100이하", label: "100만 원 이하" },
  { value: "100-200", label: "100~200만 원" },
  { value: "200-300", label: "200~300만 원" },
  { value: "300-500", label: "300~500만 원" },
  { value: "500이상", label: "500만 원 이상" },
  { value: "추천받기", label: "추천을 받고 결정하고 싶음" },
] as const;

export const Q8_OPTIONS = [
  { value: "2주내", label: "2주 내" },
  { value: "1개월내", label: "1개월 내" },
  { value: "2-3개월내", label: "2~3개월 내" },
  { value: "미정", label: "미정" },
] as const;
