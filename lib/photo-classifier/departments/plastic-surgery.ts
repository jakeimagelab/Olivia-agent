import type { DepartmentClassificationConfig } from "../types";

export const plasticSurgeryConfig: DepartmentClassificationConfig = {
  department: "plastic_surgery",
  displayName: "성형외과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 성형외과 현장 사진을 분류하는 전문가입니다.
아래 6개 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.
카테고리는 6개뿐입니다 — 수술장면/주사시술/리프팅레이저/원장치료를 나누지 말고 전부 "시술"로, 원장상담/실장상담을 나누지 말고 전부 "상담"으로 판단하세요.

장면 타입 및 핵심 단서:
- profile (프로필): 사람 1명 이상, 환자 없음, 카메라를 의식한 정지 포즈, 시술/상담 행동 없음 — 단체사진도 가능
- treatment (시술): 수술(무영등·수술복·수술포), 주사시술(보톡스/필러), 리프팅/레이저 장비 시술, 원장의 소규모 처치(면봉/핀셋)를 모두 포함
- consultation (상담): 가운/스크럽복 의사(원장상담) 또는 유니폼 실장(실장상담)이 고객과 마주 앉아 설명만 하는 장면 — 처치 도구 사용 없음
- skin_care (피부관리): 해당 진료과에서는 거의 발생하지 않음
- interior (인테리어): 인물 없이 공간 중심
- etc (기타): 접수안내, 하모니컷, 판단 어려움 등

우선순위(높을수록 먼저 적용): 프로필 > 시술 > 상담 > 피부관리 > 인테리어 > 기타
반드시 프로필 여부를 가장 먼저 검토하세요.

핵심 구분: 거울/디자인펜으로 설명만 하면 "상담", 면봉·주사기·장비로 실제 처치/시술을 하면 "시술"입니다.

JSON 형식으로만 응답:
{"sceneType":"<type>","confidence":0.0,"detectedCues":["..."],"reason":"한국어로"}`,
  sceneTypes: [
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "프로필",
      description: "정지 포즈 프로필 사진 — 1인 또는 여러 명, 환자 없음, 카메라를 의식한 포즈",
      priority: 6,
      visualCues: ["정면 응시", "정지 포즈", "팔짱", "손 모음", "로고 배경", "1인 또는 단체"],
      negativeCues: ["상담 중", "치료 중", "수술 중"],
    },
    {
      sceneType: "treatment",
      displayName: "시술",
      folderName: "시술",
      description: "전신/정맥마취 수술, 보톡스·필러 주사시술, 레이저·리프팅 장비 시술, 원장의 면봉/핀셋 처치를 모두 포함",
      priority: 5,
      visualCues: ["수술복", "수술모", "수술가운", "마스크", "멸균 장갑", "무영등", "수술실", "수술포", "수술대", "루뻭", "작은 주사기", "시린지", "바늘", "앰플", "얼굴 부위 주입", "레이저 장비", "리프팅 장비", "핸드피스", "대형 장비 본체", "케이블", "환자 베드 누움", "피부 조사", "면봉", "핀셋", "거즈", "소독도구", "얼굴 부위 접촉"],
      negativeCues: ["거울/펜만으로 설명"],
      contextRules: { includeNearbyWithinMinutes: 1, includeNearbyIfSamePeople: true, includeNearbyIfSameRoom: true },
    },
    {
      sceneType: "consultation",
      displayName: "상담",
      folderName: "상담",
      description: "가운/스크럽복 의사(원장상담) 또는 유니폼 실장(실장상담)이 고객과 마주 앉아 수술/시술 방향이나 비용을 설명만 하는 장면",
      priority: 4,
      visualCues: ["가운/스크럽복 의사", "유니폼 여성", "마주 앉음", "거울", "디자인펜", "차트", "태블릿", "얼굴형 설명", "상담실", "펜", "상담 자료"],
      negativeCues: ["주사기", "레이저 장비", "면봉/처치도구 직접 사용", "수술복"],
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
      visualCues: ["인물 없음", "로비", "상담실", "수술실"],
    },
    {
      sceneType: "etc",
      displayName: "기타",
      folderName: "기타",
      description: "접수안내, 하모니컷, 판단 어려운 컷",
      priority: 1,
      visualCues: ["접수대", "직원", "고객 응대", "여러 명", "함께 웃음", "자연스러운 대화"],
    },
  ],
};
