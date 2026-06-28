import type { DepartmentClassificationConfig } from "../types";

export const dentistryConfig: DepartmentClassificationConfig = {
  department: "dentistry",
  displayName: "치과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 치과 현장 사진을 분류하는 전문가입니다.
아래 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.

장면 타입 및 핵심 단서:
- implant_surgery (임플란트수술): 수술복·수술모·수술포·루뻭·핸드피스에 은박지·멸균 장비·어시스트·수술 라이트
- dental_treatment (치과치료): 치과 체어, 환자 누움, 치과 핸드피스/석션/구강미러/치과 라이트, 마스크·장갑
- harmony (하모니컷): 여러 명이 함께 웃음, 자연스러운 관계성, 치료 행위 아님
- doctor_consultation (원장상담): 스크럽복/가운 의사, 환자 마주 앉아 설명, 치아모형/보철모형/차트/X-ray 화면
- manager_consultation (실장상담): 유니폼 여성 상담자, 환자 마주 앉음, 상담실, 임플란트모형/서류/태블릿
- info_desk (인포데스크): 접수대/카운터, 직원 고객 응대, 예약/수납 안내, 로비
- profile (프로필): 정면 응시, 1인, 정지 포즈, 단순 배경
- interior (인테리어): 인물 없이 공간 중심
- etc (ETC): 판단 어려움, 조명불량, 테스트컷

우선순위: 임플란트수술 > 치과치료 > 하모니컷 > 원장상담 > 실장상담 > 인포데스크 > 프로필 > 인테리어

핵심 구분:
- 수술복+루뻭+은박 핸드피스+수술포 → 임플란트수술 (치과치료와 구분)
- 스크럽복 의사 단독 상담 → 원장상담 (유니폼 여성 단독 → 실장상담)

JSON 형식으로만 응답:
{"sceneType":"<type>","confidence":0.0,"detectedCues":["..."],"reason":"한국어로"}`,
  sceneTypes: [
    {
      sceneType: "implant_surgery",
      displayName: "임플란트수술",
      folderName: "06_임플란트수술",
      description: "임플란트 수술 — 수술복, 루뻭, 은박 핸드피스, 수술포, 멸균 장비",
      priority: 1,
      visualCues: ["수술복", "수술모", "수술포/멸균포", "루뻭/확대경", "핸드피스 은박지", "멸균 장비", "어시스트", "수술 라이트"],
      negativeCues: ["일반 치과 핸드피스", "석션만 있음", "수술포 없음"],
    },
    {
      sceneType: "dental_treatment",
      displayName: "치과치료",
      folderName: "05_치과치료",
      description: "보철·신경치료·충치 등 일반 치과 치료 — 체어, 핸드피스, 구강 미러",
      priority: 2,
      visualCues: ["치과 체어", "환자 누움", "치과 핸드피스", "석션", "구강 미러", "치과 라이트", "마스크", "장갑"],
      negativeCues: ["수술복", "루뻭", "은박 핸드피스", "수술포"],
    },
    {
      sceneType: "harmony",
      displayName: "하모니컷",
      folderName: "04_하모니컷",
      description: "의사·직원·환자가 함께 웃으며 관계성을 보여주는 장면",
      priority: 3,
      visualCues: ["여러 명", "함께 웃음", "자연스러운 관계", "따뜻한 분위기"],
      negativeCues: ["치료 중", "수술 중", "단독 포즈"],
    },
    {
      sceneType: "doctor_consultation",
      displayName: "원장상담",
      folderName: "03_원장상담",
      description: "스크럽복/가운 치과의사가 환자와 상담하는 장면",
      priority: 4,
      visualCues: ["스크럽복", "가운 의사", "마주 앉아 설명", "치아/보철 모형", "X-ray 화면", "차트"],
      negativeCues: ["접수대", "유니폼 여성 단독", "치료 체어 치료 중", "수술포"],
    },
    {
      sceneType: "manager_consultation",
      displayName: "실장상담",
      folderName: "02_실장상담",
      description: "유니폼 여성 실장이 환자에게 치료 계획을 설명하는 장면",
      priority: 5,
      visualCues: ["유니폼 여성", "상담실", "임플란트/보철 모형", "서류", "태블릿", "펜"],
      negativeCues: ["스크럽복 의사", "치료 체어", "수술복"],
    },
    {
      sceneType: "info_desk",
      displayName: "인포데스크",
      folderName: "01_인포데스크",
      description: "접수대에서 직원이 환자를 응대하는 장면",
      priority: 6,
      visualCues: ["접수대", "카운터", "직원", "예약/수납 안내", "로비", "병원 로고"],
      negativeCues: ["치료 체어", "핸드피스", "수술복"],
    },
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "07_프로필",
      description: "정면 응시 정지 포즈의 프로필 사진",
      priority: 7,
      visualCues: ["정면 응시", "1인", "정지 포즈", "단순 배경"],
      negativeCues: ["치료 중", "수술 중", "여러 명"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "08_인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 8,
      visualCues: ["인물 없음", "공간", "로비", "진료실"],
    },
    {
      sceneType: "etc",
      displayName: "ETC_확인필요",
      folderName: "00_ETC_확인필요",
      description: "판단 어려운 컷, 조명불량, 테스트컷",
      priority: 0,
      visualCues: [],
    },
  ],
};
