import type { DepartmentClassificationConfig } from "../types";

export const orthopedicsNeurosurgeryConfig: DepartmentClassificationConfig = {
  department: "orthopedics_neurosurgery",
  displayName: "정형외과/신경외과/마취통증의학과/재활의학과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 정형외과/신경외과/마취통증의학과/재활의학과 현장 사진을 분류하는 전문가입니다.
아래 6개 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.
카테고리는 6개뿐입니다 — C-ARM/X-ray/초음파/충격파/물리치료 등 세부 시술 종류로 나누지 말고 전부 "시술"로 판단하세요.

장면 타입 및 핵심 단서:
- profile (프로필): 사람 1명 이상, 환자 없음, 카메라를 의식한 정지 포즈, 시술/상담 행동 없음 — 의료진 단독이든 단체든 가능
- treatment (시술): C-ARM 시술, X-ray 촬영, 초음파시술, 충격파/도수/재활치료, 물리치료 전부 포함 — 장비·핸드피스·전기치료 패드 사용 중, 환자가 치료를 받는 중
- consultation (상담): 원장이 환자와 마주 앉아 설명하거나 촉진하는 장면 — 대형 장비 없음
- skin_care (피부관리): 해당 진료과에서는 거의 발생하지 않음. 명확한 피부미용 케어 장면일 때만 사용
- interior (인테리어): 인물 없이 공간 중심
- etc (기타): 접수안내, 하모니컷(여러 명이 함께 웃는 관계성 사진), 판단 어려움 등

우선순위(높을수록 먼저 적용): 프로필 > 시술 > 상담 > 피부관리 > 인테리어 > 기타
반드시 프로필 여부를 가장 먼저 검토하세요.

JSON 형식으로만 응답:
{"sceneType":"<type>","confidence":0.0,"detectedCues":["..."],"reason":"한국어로"}`,
  sceneTypes: [
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "프로필",
      description: "정지 포즈 프로필 사진 — 1인 또는 여러 명, 환자 없음, 카메라를 의식한 포즈",
      priority: 6,
      visualCues: ["정면 응시", "정지 포즈", "단순 배경", "1인 또는 단체"],
      negativeCues: ["장비", "치료 중", "환자와 대화"],
    },
    {
      sceneType: "treatment",
      displayName: "시술",
      folderName: "시술",
      description: "C-ARM 시술(신경차단술·통증시술), X-ray 촬영, 초음파시술, 충격파/도수/재활치료, 물리치료를 모두 포함",
      priority: 5,
      visualCues: ["C자형 대형 장비", "반원형 방사선 투시 장비", "환자 베드 누움", "장갑/마스크", "주사 시술", "큰 흰색 방사선 장비", "촬영판", "튜브 패널", "환자 위치 조정", "초음파 모니터", "초음파 프로브", "젤 접촉", "목/어깨/허리/무릎 부위", "치료사", "핸드피스 형태 장비", "근골격 직접 접촉", "충격파 장비", "재활 장비", "치료실 베드", "전기치료 패드", "온열/견인 장비", "저주파 장비"],
      negativeCues: ["의자에 앉아 설명만 듣는 중", "장비 없음"],
    },
    {
      sceneType: "consultation",
      displayName: "상담",
      folderName: "상담",
      description: "원장이 환자와 마주 앉아 설명하거나 신체 부위를 직접 확인하는 장면",
      priority: 4,
      visualCues: ["흰 가운 원장", "마주 앉음", "발목/무릎/어깨/허리 촉진", "차트", "모형"],
      negativeCues: ["대형 장비", "치료 패드", "핸드피스"],
    },
    {
      sceneType: "skin_care",
      displayName: "피부관리",
      folderName: "피부관리",
      description: "피부/미용 관리 장면 (해당 진료과에서는 드묾)",
      priority: 3,
      visualCues: ["관리 도구", "베드에 누움"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 2,
      visualCues: ["인물 없음", "공간", "로비", "치료실"],
    },
    {
      sceneType: "etc",
      displayName: "기타",
      folderName: "기타",
      description: "접수안내, 하모니컷, 판단 어려운 컷, 조명불량, 테스트컷",
      priority: 1,
      visualCues: ["접수대", "직원", "고객 응대", "여러 명", "함께 웃음", "따뜻한 분위기"],
    },
  ],
};
