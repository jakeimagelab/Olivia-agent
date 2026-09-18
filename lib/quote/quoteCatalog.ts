import type { Brand } from "@/lib/quote/quoteFormTypes";

// components/quote/QuoteBuilder.tsx(사람이 쓰는 폼)와 lib/quote/computeQuoteTotals.ts(Agent가
// 채팅 Preview Card 등에서 같은 합계를 계산할 때) 둘 다 정확히 같은 패키지/단가/브랜드 설정을
// 봐야 해서 컴포넌트 밖으로 분리했다 — 값은 QuoteBuilder.tsx에 있던 것을 그대로 옮긴 것이라
// 변경 없음.
export type PackageOption = {
  id: string;
  name: string;
  price: number;
  composition: string;
};

export type SingleItem = {
  id: string;
  name: string;
  price: number;
};

export const packages: PackageOption[] = [
  {
    id: "standard",
    name: "스탠다드",
    price: 1350000,
    composition: "프로필 + 연출사진"
  },
  {
    id: "premium",
    name: "프리미엄",
    price: 2000000,
    composition: "프로필 + 연출사진 + 인테리어"
  },
  {
    id: "premium-plus-1",
    name: "프리미엄 플러스 1",
    price: 3600000,
    composition: "프로필 + 연출사진 + 인테리어 + 포인트영상"
  },
  {
    id: "premium-plus-2",
    name: "프리미엄 플러스 2",
    price: 4500000,
    composition: "프로필 + 연출사진 + 인테리어 + 브랜드필름"
  }
];

// 포토클리닉 단일항목 — 고정 단가 버튼으로 표시된다(QuoteBuilder.tsx의 brand !== "jakeimage" 분기).
export const singleItems: SingleItem[] = [
  {
    id: "studio-profile",
    name: "프로필촬영",
    price: 350000
  },
  {
    id: "directing",
    name: "연출 촬영",
    price: 1200000
  },
  {
    id: "interior",
    name: "인테리어 촬영",
    price: 750000
  },
  {
    id: "brand-film",
    name: "브랜드필름",
    price: 2800000
  },
  {
    id: "point-video",
    name: "포인트영상",
    price: 1800000
  }
];

// 제이크이미지연구소 단일항목 — QuoteBuilder.tsx의 brand === "jakeimage" 분기는 이 price를
// 화면에 쓰지 않는다(항목을 선택하면 자유 텍스트 "내용 입력" 칸이 뜨고 singleItemNotes[id]에
// 저장되며, 견적 총액 계산에서는 제외된다) — 그래서 price는 전부 0(미사용 placeholder)이다.
// 브랜드필름 + 포인트영상은 "영상촬영" 하나로 통합했다.
export const jakeimageSingleItems: SingleItem[] = [
  {
    id: "studio-profile",
    name: "프로필촬영",
    price: 0
  },
  {
    id: "sketch",
    name: "스케치촬영",
    price: 0
  },
  {
    id: "directing",
    name: "연출 촬영",
    price: 0
  },
  {
    id: "interior",
    name: "인테리어 촬영",
    price: 0
  },
  {
    id: "video-shoot",
    name: "영상촬영",
    price: 0
  }
];

export function getSingleItems(brand: Brand): SingleItem[] {
  return brand === "jakeimage" ? jakeimageSingleItems : singleItems;
}

export const BRAND_CONFIG: Record<Brand, {
  label: string;
  logo: string;
  defaultQuoteTitle: string;
  entityLabel: string;
  entityPlaceholder: string;
  emailPlaceholder: string;
  largeScaleLabel: string;
  customItemsLabel: string;
  brandMarkCaption: string;
  sloganLines: string[];
  railCaptionTitle: string | null;
  railCaptionSub: string | null;
  railNoticeTitle: string;
  railNoticeSub: string;
  railNoticeDetail: string;
  popupBg: string;
  quoteNumberPrefix: string;
  defaultMemo: string;
}> = {
  photoclinic: {
    label: "포토클리닉",
    logo: "/assets/photoclinic-logo.png?v=3",
    defaultQuoteTitle: "포토클리닉 브랜드사진 견적서",
    entityLabel: "병원명",
    entityPlaceholder: "포토클리닉",
    emailPlaceholder: "photoclnic@gmail.com",
    largeScaleLabel: "병원급 규모 추가",
    customItemsLabel: "기타 항목",
    brandMarkCaption: "제이크이미지연구소 · 병원 전문 브랜드 촬영",
    sloganLines: ["브랜드를 담습니다.", "정직하고,", "자연스럽게."],
    railCaptionTitle: "PHOTO CLINIC",
    railCaptionSub: "BRAND STUDIO",
    railNoticeTitle: "포토클리닉",
    railNoticeSub: "제이크이미지연구소",
    railNoticeDetail: "병원 전문 브랜드 촬영",
    popupBg: "#f0f4f2",
    quoteNumberPrefix: "PC-",
    defaultMemo: ""
  },
  jakeimage: {
    label: "제이크이미지연구소",
    logo: "/assets/jakeimage-logo-2026.png",
    defaultQuoteTitle: "제이크이미지연구소 브랜드사진 견적서",
    entityLabel: "회사명",
    entityPlaceholder: "제이크이미지연구소",
    emailPlaceholder: "contact@jakeimage.com",
    largeScaleLabel: "대형 규모 촬영 추가",
    customItemsLabel: "추가항목",
    brandMarkCaption: "Jake Image Institute · Brand Image Direction",
    sloganLines: ["스토리와", "AI로", "브랜드를", "만듭니다"],
    railCaptionTitle: "jake image lab",
    railCaptionSub: "Jake Image Institute",
    railNoticeTitle: "제이크이미지연구소",
    railNoticeSub: "기업과 개인 브랜드의",
    railNoticeDetail: "이미지를 설계합니다.",
    popupBg: "#eef1f5",
    quoteNumberPrefix: "JI-",
    defaultMemo: "촬영 범위와 일정은 상담 후 최종 확정됩니다."
  }
};
