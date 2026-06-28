import type { DepartmentClassificationConfig } from "../types";

export const orthopedicsNeurosurgeryConfig: DepartmentClassificationConfig = {
  department: "orthopedics_neurosurgery",
  displayName: "정형외과/신경외과/마취통증의학과/재활의학과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 정형외과/신경외과/마취통증의학과/재활의학과 현장 사진을 분류하는 전문가입니다.
아래 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.

장면 타입 및 핵심 단서:
- c_arm_procedure (C-ARM시술): C자형 대형 방사선 투시 장비, 환자 베드, 의료진 시술 중, 장갑/마스크
- xray (X-ray): 큰 흰색 방사선 장비/촬영판/패널, 환자 서있거나 위치 잡음, X-ray 기기 조정
- ultrasound_procedure (초음파시술): 초음파 모니터/프로브, 젤 접촉, 목·어깨·허리·무릎 부위
- shockwave_manual_therapy (충격파_도수_재활): 치료사, 핸드피스형 치료 장비, 근골격 직접 접촉
- physical_therapy (물리치료): 치료실/물리치료실, 전기치료 패드/온열/견인 장비, 베드, 직원 중심
- doctor_consultation (진료상담): 흰 가운 원장, 환자와 마주 앉음, 촉진, 모형/차트/모니터, 대형 장비 없음
- harmony (하모니컷): 여러 명이 함께 웃음, 따뜻한 관계성, 치료 행위 아님
- profile (프로필): 정면 응시, 1인, 정지 포즈, 단순 배경
- interior (인테리어): 인물 없이 공간 중심
- reception (접수안내): 접수대, 직원, 고객 응대
- etc (ETC): 판단 어려움, 조명불량, 테스트컷

우선순위: C-ARM > X-ray > 초음파 > 충격파도수재활 > 물리치료 > 진료상담 > 하모니컷 > 프로필 > 인테리어 > 접수

JSON 형식으로만 응답:
{"sceneType":"<type>","confidence":0.0,"detectedCues":["..."],"reason":"한국어로"}`,
  sceneTypes: [
    {
      sceneType: "c_arm_procedure",
      displayName: "C-ARM시술",
      folderName: "02_C-ARM시술",
      description: "C자형 방사선 투시 장비를 이용한 시술 — 신경차단술, 통증시술",
      priority: 1,
      visualCues: ["C자형 대형 장비", "반원형 방사선 투시 장비", "환자 베드 누움", "장갑/마스크", "주사 시술"],
      negativeCues: ["일반 X-ray 판", "초음파 모니터"],
    },
    {
      sceneType: "xray",
      displayName: "X-ray",
      folderName: "01_X-ray",
      description: "X-ray 장비로 신체 부위를 촬영하는 장면",
      priority: 2,
      visualCues: ["큰 흰색 방사선 장비", "촬영판", "튜브 패널", "환자 위치 조정", "X-ray 기기"],
      negativeCues: ["C자형 구조 강함", "초음파 프로브", "상담실 모니터"],
    },
    {
      sceneType: "ultrasound_procedure",
      displayName: "초음파시술",
      folderName: "03_초음파시술",
      description: "초음파 장비를 이용한 통증 시술/확인",
      priority: 3,
      visualCues: ["초음파 모니터", "초음파 프로브", "젤 접촉", "장갑", "목/어깨/허리/무릎 부위"],
      negativeCues: ["C자형 대형 장비", "X-ray 방사선 장비"],
    },
    {
      sceneType: "shockwave_manual_therapy",
      displayName: "충격파_도수_재활",
      folderName: "06_충격파_도수_재활",
      description: "충격파, 도수치료, 재활치료 — 치료사의 능동적 핸드피스/손기술 사용",
      priority: 4,
      visualCues: ["치료사", "핸드피스 형태 장비", "근골격 직접 접촉", "충격파 장비", "재활 장비"],
      negativeCues: ["초음파 프로브+모니터", "의사 단독 진료실"],
    },
    {
      sceneType: "physical_therapy",
      displayName: "물리치료",
      folderName: "05_물리치료",
      description: "물리치료실에서 직원이 치료 장비를 부착/관리하는 장면",
      priority: 5,
      visualCues: ["치료실 베드", "전기치료 패드", "온열/견인 장비", "저주파 장비", "직원 중심"],
      negativeCues: ["의사가 주사/시술", "핸드피스 직접 접촉"],
    },
    {
      sceneType: "doctor_consultation",
      displayName: "진료상담",
      folderName: "04_진료상담",
      description: "원장이 환자와 마주 앉아 설명하거나 신체 부위를 직접 확인하는 장면",
      priority: 6,
      visualCues: ["흰 가운 원장", "마주 앉음", "발목/무릎/어깨/허리 촉진", "차트", "모형"],
      negativeCues: ["대형 장비", "치료 패드", "핸드피스"],
    },
    {
      sceneType: "harmony",
      displayName: "하모니컷",
      folderName: "07_하모니컷",
      description: "의사·직원·환자가 함께 웃으며 관계성을 보여주는 장면",
      priority: 7,
      visualCues: ["여러 명", "함께 웃음", "따뜻한 분위기", "관계성"],
      negativeCues: ["치료 행위", "장비 사용"],
    },
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "08_프로필",
      description: "정면 응시 정지 포즈의 프로필 사진",
      priority: 8,
      visualCues: ["정면 응시", "1인", "정지 포즈", "단순 배경"],
      negativeCues: ["장비", "치료 중", "환자와 대화"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "09_인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 9,
      visualCues: ["인물 없음", "공간", "로비", "치료실"],
    },
    {
      sceneType: "reception",
      displayName: "접수안내",
      folderName: "10_접수안내",
      description: "접수대에서 직원이 환자를 안내하는 장면",
      priority: 10,
      visualCues: ["접수대", "직원", "고객 응대", "예약"],
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
