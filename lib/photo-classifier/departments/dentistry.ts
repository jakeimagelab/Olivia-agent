import type { DepartmentClassificationConfig } from "../types";

export const dentistryConfig: DepartmentClassificationConfig = {
  department: "dentistry",
  displayName: "치과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 치과 현장 사진을 분류하는 전문가입니다.
아래 6개 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.
카테고리는 6개뿐입니다 — 임플란트수술/치과치료를 나누지 말고 전부 "시술"로, 원장상담/실장상담을 나누지 말고 전부 "상담"으로 판단하세요.

장면 타입 및 핵심 단서:
- profile (프로필): 사람 1명 이상, 환자 없음, 카메라를 의식한 정지 포즈, 시술/상담 행동 없음 — 단체사진도 가능
- treatment (시술): 임플란트 수술(수술복·루뻭·은박 핸드피스·수술포)과 일반 치과치료(체어·핸드피스·구강미러)를 모두 포함
- consultation (상담): 스크럽복 의사(원장상담) 또는 유니폼 여성 실장(실장상담)이 환자와 마주 앉아 설명하는 장면
- skin_care (피부관리): 해당 진료과에서는 거의 발생하지 않음
- interior (인테리어): 인물 없이 공간 중심
- etc (기타): 인포데스크(접수), 하모니컷, 판단 어려움 등

우선순위(높을수록 먼저 적용): 프로필 > 시술 > 상담 > 피부관리 > 인테리어 > 기타
반드시 프로필 여부를 가장 먼저 검토하세요.

핵심 구분: 수술복+루뻭+은박 핸드피스+수술포든, 일반 치과 체어+핸드피스든 전부 "시술"로 분류합니다.

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
      negativeCues: ["치료 중", "수술 중"],
    },
    {
      sceneType: "treatment",
      displayName: "시술",
      folderName: "시술",
      description: "임플란트 수술과 보철·신경치료·충치 등 일반 치과 치료를 모두 포함",
      priority: 5,
      visualCues: ["수술복", "수술모", "수술포/멸균포", "루뻭/확대경", "핸드피스 은박지", "멸균 장비", "어시스트", "수술 라이트", "치과 체어", "환자 누움", "치과 핸드피스", "석션", "구강 미러", "치과 라이트", "마스크", "장갑"],
    },
    {
      sceneType: "consultation",
      displayName: "상담",
      folderName: "상담",
      description: "스크럽복/가운 의사(원장상담) 또는 유니폼 여성 실장(실장상담)이 환자와 상담하는 장면",
      priority: 4,
      visualCues: ["스크럽복", "가운 의사", "유니폼 여성", "마주 앉아 설명", "치아/보철 모형", "X-ray 화면", "차트", "상담실", "서류", "태블릿", "펜"],
      negativeCues: ["치료 체어 치료 중", "수술포"],
    },
    {
      sceneType: "skin_care",
      displayName: "피부관리",
      folderName: "피부관리",
      description: "피부/미용 관리 장면 (해당 진료과에서는 드묾)",
      priority: 3,
      visualCues: ["관리 도구"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 2,
      visualCues: ["인물 없음", "공간", "로비", "진료실"],
    },
    {
      sceneType: "etc",
      displayName: "기타",
      folderName: "기타",
      description: "접수대 안내(인포데스크), 하모니컷, 판단 어려운 컷",
      priority: 1,
      visualCues: ["접수대", "카운터", "직원", "예약/수납 안내", "로비", "병원 로고", "여러 명", "함께 웃음"],
    },
  ],
};
