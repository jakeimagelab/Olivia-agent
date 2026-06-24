export const hospitals = [
  {
    id: "onyou",
    name: "온유성형외과",
    managerName: "김실장",
    phone: "010-0000-0000",
    email: "manager@onyouclinic.kr",
    websiteUrl: "https://onyouclinic.kr",
    instagramUrl: "https://instagram.com/onyouclinic",
    blogUrl: "https://blog.naver.com/onyouclinic",
    naverPlaceUrl: "https://naver.me/onyou",
    status: "active",
    startDate: "2026-06-01",
    monthlyPrice: 500000,
    quota: 16,
    remaining: 7,
    memo: "원장 프로필과 상담 장면 중심. 매월 블로그 2건, 인스타 8건 우선."
  },
  {
    id: "barun",
    name: "바른이치과",
    managerName: "박팀장",
    phone: "010-1111-2222",
    email: "brand@barundental.kr",
    websiteUrl: "https://barundental.kr",
    instagramUrl: "https://instagram.com/barundental",
    blogUrl: "https://blog.naver.com/barundental",
    naverPlaceUrl: "https://naver.me/barun",
    status: "active",
    startDate: "2026-05-01",
    monthlyPrice: 500000,
    quota: 20,
    remaining: 5,
    memo: "임플란트, 교정, 의료진 소개 콘텐츠를 번갈아 발행."
  },
  {
    id: "laon",
    name: "라온피부과",
    managerName: "이매니저",
    phone: "010-3333-4444",
    email: "hello@laonderma.kr",
    websiteUrl: "https://laonderma.kr",
    instagramUrl: "https://instagram.com/laonderma",
    blogUrl: "https://blog.naver.com/laonderma",
    naverPlaceUrl: "https://naver.me/laon",
    status: "paused",
    startDate: "2026-04-15",
    monthlyPrice: 500000,
    quota: 12,
    remaining: 12,
    memo: "여름 시즌 전 재촬영 후 운영 재개 예정."
  }
];

export const assets = [
  {
    id: "asset-1",
    hospitalId: "onyou",
    title: "대표원장 프로필 A컷",
    category: "원장 프로필",
    fileType: "photo",
    fileUrl: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=900&q=80&auto=format&fit=crop",
    channels: ["인스타그램", "블로그", "홈페이지"],
    modelReleaseStatus: "동의 완료",
    favorite: true,
    used: false
  },
  {
    id: "asset-2",
    hospitalId: "onyou",
    title: "상담실 자연광 컷",
    category: "상담 장면",
    fileType: "photo",
    fileUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=900&q=80&auto=format&fit=crop",
    channels: ["블로그", "네이버 플레이스", "홈페이지"],
    modelReleaseStatus: "환자 비노출",
    favorite: true,
    used: false
  },
  {
    id: "asset-3",
    hospitalId: "barun",
    title: "치과 로비 공간",
    category: "병원 공간",
    fileType: "photo",
    fileUrl: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=900&q=80&auto=format&fit=crop",
    channels: ["인스타그램", "네이버 플레이스"],
    modelReleaseStatus: "해당 없음",
    favorite: false,
    used: true
  }
];

export const calendarItems = [
  { id: "cal-1", hospitalId: "onyou", date: "2026-06-17", channel: "Instagram", contentType: "원장 소개", title: "대표원장의 상담 철학", status: "디자인중" },
  { id: "cal-2", hospitalId: "onyou", date: "2026-06-19", channel: "Blog", contentType: "진료 철학", title: "처음 상담에서 확인하는 것들", status: "문구작성중" },
  { id: "cal-3", hospitalId: "barun", date: "2026-06-21", channel: "Naver Place", contentType: "장비 소개", title: "디지털 구강 스캔 안내", status: "병원검수중" },
  { id: "cal-4", hospitalId: "barun", date: "2026-06-24", channel: "Reels/Shorts", contentType: "병원 공간", title: "진료 전 대기 공간", status: "기획중" }
];

export const reportItems = [
  { hospitalId: "onyou", completed: 11, pending: 4, reportsSent: 1 },
  { hospitalId: "barun", completed: 15, pending: 5, reportsSent: 1 },
  { hospitalId: "laon", completed: 2, pending: 0, reportsSent: 0 }
];

export const getHospital = (id: string) => hospitals.find((hospital) => hospital.id === id) || hospitals[0];
