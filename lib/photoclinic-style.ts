// ── 포토클리닉 인스타그램 스타일 가이드 ──────────────────
// @photoclinic_kr 계정 기반
// 톤: 다크·고급·감성적 / 병원사진 포트폴리오 중심

export const PC_STYLE = {
  // 브랜드 컬러 팔레트
  brand: {
    orange:  "#E85D2C",
    orange2: "#EB8F22",
    teal:    "#155855",
    teal2:   "#569082",
    cream:   "#F5F0EB",
  },

  // 인스타 피드 톤앤매너
  feed: {
    mood:       "따뜻하고 감성적인 필름 느낌 — 병원사진이지만 딱딱하지 않고 사람 냄새나는 따뜻한 톤",
    colorTone:  "따뜻한 색온도(+15~25), 약간 낮은 채도(80~85%), 살짝 언더한 밝기. 필름 그레인 느낌",
    textStyle:  "스토리텔링형. 5줄 이상. 촬영 현장의 이야기, 병원의 사람들, 순간의 감정을 담은 문장",
    hashtagSet: "포토클리닉 전용 고정 태그 + 진료과·주제별 태그",
  },

  // 콘텐츠 유형별 캡션 패턴
  contentTypes: {
    portfolio:  "결과물 중심. 병원명 or 진료과 + 한 줄 감성 문장",
    bts:        "촬영 과정 소개. 현장 분위기 + 포토클리닉 철학",
    philosophy: "병원 브랜딩에 대한 생각. 짧고 깊은 문장",
    space:      "공간의 감성을 담은 캡션. 인테리어·조명 강조",
    profile:    "의료진 프로필. 사람의 이야기를 담은 문장",
  },

  // 고정 해시태그 (항상 포함)
  fixedHashtags: [
    "#포토클리닉", "#photoclinic", "#병원사진", "#병원브랜딩",
    "#의료진프로필", "#병원사진촬영", "#원장프로필", "#병원홍보사진",
  ],

  // 주제별 해시태그
  topicHashtags: {
    portfolio:  ["#포트폴리오", "#병원촬영결과", "#촬영결과물", "#branding"],
    interior:   ["#병원인테리어", "#병원공간", "#의료공간", "#인테리어사진"],
    profile:    ["#의사프로필", "#의료진", "#닥터", "#프로필사진", "#doctor"],
    bts:        ["#촬영현장", "#비하인드", "#촬영스튜디오", "#BTS"],
    philosophy: ["#병원마케팅", "#브랜딩철학", "#의료브랜딩", "#콘텐츠마케팅"],
  },

  // 진료과별 추가 태그
  deptHashtags: {
    피부과:   ["#피부과", "#피부과촬영", "#dermatology", "#피부과브랜딩"],
    성형외과: ["#성형외과", "#성형외과사진", "#plasticsurgery"],
    치과:     ["#치과", "#치과촬영", "#dental", "#치과브랜딩"],
    안과:     ["#안과", "#안과촬영", "#ophthalmology"],
    정형외과: ["#정형외과", "#orthopedics"],
    한의원:   ["#한의원", "#한방", "#한의원사진"],
    산부인과: ["#산부인과", "#여성의원"],
    내과:     ["#내과", "#내과촬영"],
  },

  // 캡션 템플릿 (포토클리닉 스타일)
  captionTemplates: {
    portfolio: [
      "촬영 당일, 원장님은 긴장하셨습니다.\n사진 찍히는 걸 좋아하지 않는다고 하셨어요.\n\n그런데 셔터를 누르는 순간,\n카메라 앞에서도 원장님의 따뜻함은\n숨길 수가 없었습니다.\n\n사진은 거짓말을 하지 않아요.",
      "공간을 걷다 보면\n이 병원이 얼마나 많은 것을 생각하며 만들어졌는지\n느낄 수 있었습니다.\n\n그 생각들을 사진에 담는 것.\n그게 저희가 하는 일입니다.",
    ],
    bts: [
      "촬영 시작 전,\n항상 병원을 한 바퀴 걷습니다.\n\n어느 공간에 빛이 들어오는지,\n어느 각도에서 사람이 가장 자연스러운지,\n잠시 들여다보는 시간.\n\n그 시간이 사진의 절반입니다.",
    ],
    philosophy: [
      "병원사진은 예쁜 사진이 아니어도 됩니다.\n\n환자가 처음 홈페이지를 열었을 때,\n'여기라면 괜찮겠다'는 마음이 드는 것.\n그게 좋은 병원사진입니다.\n\n포토클리닉이 만들어가는 신뢰의 이미지.",
    ],
  },
};

// 팬톤 컬러 추천 (다크 고급 톤 중심)
export const PANTONE_PALETTES = [
  {
    name: "Dark Premium",
    colors: [
      { name: "Pantone 19-4024", hex: "#1C2B28", label: "Mountain View" },
      { name: "Pantone 18-1250", hex: "#E85D2C", label: "Flame Orange" },
      { name: "Pantone 17-0535", hex: "#569082", label: "Sage" },
      { name: "Pantone 11-0601", hex: "#F5F0EB", label: "Blanc de Blanc" },
      { name: "Pantone 19-1217", hex: "#3D2B1F", label: "Espresso" },
    ],
  },
  {
    name: "Warm Neutral",
    colors: [
      { name: "Pantone 12-0712", hex: "#EDE0CC", label: "Almond Milk" },
      { name: "Pantone 16-1318", hex: "#B89B7A", label: "Warm Taupe" },
      { name: "Pantone 18-1048", hex: "#9C6644", label: "Caramel" },
      { name: "Pantone 19-0915", hex: "#4A3728", label: "Dark Earth" },
      { name: "Pantone 15-1062", hex: "#EB8F22", label: "Amber" },
    ],
  },
  {
    name: "Cool Clinical",
    colors: [
      { name: "Pantone 11-0601", hex: "#F8F7F5", label: "White Sand" },
      { name: "Pantone 14-4122", hex: "#A8BFC0", label: "Stillwater" },
      { name: "Pantone 18-4735", hex: "#155855", label: "Deep Teal" },
      { name: "Pantone 19-4150", hex: "#1A3A4A", label: "Naval" },
      { name: "Pantone 19-3911", hex: "#2C2B35", label: "Graphite" },
    ],
  },
  {
    name: "Forest Organic",
    colors: [
      { name: "Pantone 15-0751", hex: "#D4C88A", label: "Mellow Yellow" },
      { name: "Pantone 17-0535", hex: "#6B8F5E", label: "Foliage" },
      { name: "Pantone 18-0430", hex: "#4A6741", label: "Dark Moss" },
      { name: "Pantone 19-0419", hex: "#2E3B2C", label: "Forest Night" },
      { name: "Pantone 13-0002", hex: "#EAE7DC", label: "Birch" },
    ],
  },
  {
    name: "Luxury Monochrome",
    colors: [
      { name: "Pantone 11-0601", hex: "#FFFFFF", label: "White" },
      { name: "Pantone 13-0002", hex: "#E8E4DC", label: "Cloud" },
      { name: "Pantone 16-0000", hex: "#9E9C9A", label: "Silver Fog" },
      { name: "Pantone 18-0306", hex: "#5C5A56", label: "Castor" },
      { name: "Pantone 19-0303", hex: "#1A1A18", label: "Jet Black" },
    ],
  },
];

export const FONT_PAIRS = [
  { display: "Noto Serif KR", body: "Noto Sans KR",   label: "세리프 · 클래식" },
  { display: "Noto Sans KR",  body: "Noto Sans KR",   label: "고딕 · 모던" },
  { display: "Nanum Myeongjo", body: "Nanum Gothic",  label: "명조 · 서정적" },
  { display: "Do Hyeon",      body: "Noto Sans KR",   label: "도현 · 감각적" },
  { display: "Black Han Sans", body: "Noto Sans KR",  label: "블랙한산스 · 임팩트" },
  { display: "Gaegu",         body: "Noto Sans KR",   label: "개구 · 친근함" },
];
