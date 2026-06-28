import type { DepartmentClassificationConfig } from "../types";

export const plasticSurgeryConfig: DepartmentClassificationConfig = {
  department: "plastic_surgery",
  displayName: "성형외과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 성형외과 현장 사진을 분류하는 전문가입니다.
아래 장면 타입 중 하나를 선택하고, 시각적 단서와 확신도(0~1)를 반환하세요.

장면 타입 및 핵심 단서:
- surgery_scene (수술장면): 수술복·수술모·마스크·멸균장갑·무영등·수술실·수술포·수술대·루뻭·수술도구
- injection_treatment (주사시술): 작은 주사기/시린지/바늘/앰플, 얼굴 부위 주입, 보톡스/필러/스킨부스터, 장갑
- lifting_laser_treatment (리프팅_레이저): 레이저/리프팅 장비, 핸드피스, 대형 장비 본체, 환자 베드 누움, 피부 조사
- doctor_treatment (원장치료): 가운/스크럽복 의사, 면봉/핀셋/거즈/소독도구, 얼굴 부위 직접 처치
- doctor_consultation (원장상담): 가운/스크럽복 의사, 고객과 마주 앉음, 거울/디자인펜/차트/태블릿, 설명만
- manager_consultation (실장상담): 유니폼 여성 상담자, 상담실, 거울/펜/상담자료, 수술/시술 설명
- harmony (하모니컷): 여러 명이 함께 웃음, 자연스러운 관계성, 치료 행위 아님
- profile (프로필): 정면 응시, 1인, 정지 포즈
- interior (인테리어): 인물 없이 공간 중심
- reception (접수안내): 접수대, 직원, 고객 응대
- etc (ETC): 판단 어려움

우선순위: 수술장면 > 주사시술 > 리프팅/레이저 > 원장치료 > 원장상담 > 실장상담 > 하모니컷 > 프로필 > 인테리어 > 접수

핵심 구분:
- 무영등+수술복+수술모+수술포 → 수술장면
- 주사기/시린지+얼굴 주입 → 주사시술
- 거울/디자인펜으로 설명만 → 원장상담 / 면봉·처치도구로 직접 처치 → 원장치료

JSON 형식으로만 응답:
{"sceneType":"<type>","confidence":0.0,"detectedCues":["..."],"reason":"한국어로"}`,
  sceneTypes: [
    {
      sceneType: "surgery_scene",
      displayName: "수술장면",
      folderName: "03_수술장면",
      description: "수술복·무영등·수술포·수술실 — 전신마취/정맥마취 수술 장면",
      priority: 1,
      visualCues: ["수술복", "수술모", "수술가운", "마스크", "멸균 장갑", "무영등", "수술실", "수술포", "수술대", "루뻭", "수술 도구"],
      negativeCues: ["주사기만", "소규모 처치도구", "대기실"],
    },
    {
      sceneType: "injection_treatment",
      displayName: "주사시술",
      folderName: "04_주사시술",
      description: "보톡스·필러·스킨부스터 등 주사 시술 — 작은 주사기/시린지 얼굴 주입",
      priority: 2,
      visualCues: ["작은 주사기", "시린지", "바늘", "앰플", "얼굴 부위 주입", "장갑", "보톡스/필러"],
      negativeCues: ["대형 장비", "수술복", "무영등", "레이저 핸드피스"],
      contextRules: { includeNearbyWithinMinutes: 1, includeNearbyIfSamePeople: true, includeNearbyIfSameRoom: true },
    },
    {
      sceneType: "lifting_laser_treatment",
      displayName: "리프팅_레이저",
      folderName: "05_리프팅_레이저",
      description: "레이저·초음파리프팅·고주파 등 장비 시술",
      priority: 3,
      visualCues: ["레이저 장비", "리프팅 장비", "핸드피스", "대형 장비 본체", "케이블", "장비 모니터", "환자 베드 누움", "피부 조사"],
      negativeCues: ["주사기/시린지", "수술복/무영등"],
    },
    {
      sceneType: "doctor_treatment",
      displayName: "원장치료",
      folderName: "07_원장치료",
      description: "의사가 소규모 처치도구로 얼굴 부위를 직접 처치하는 장면",
      priority: 4,
      visualCues: ["가운/스크럽복 의사", "면봉", "핀셋", "거즈", "소독도구", "얼굴 부위 접촉", "처치 중"],
      negativeCues: ["주사기", "레이저 장비", "수술복", "거울/펜만으로 설명"],
    },
    {
      sceneType: "doctor_consultation",
      displayName: "원장상담",
      folderName: "02_원장상담",
      description: "의사가 고객과 마주 앉아 수술/시술 방향을 설명하는 장면",
      priority: 5,
      visualCues: ["가운/스크럽복 의사", "마주 앉음", "거울", "디자인펜", "차트", "태블릿", "얼굴형 설명"],
      negativeCues: ["주사기", "레이저 장비", "면봉/처치도구 직접 사용", "수술복"],
    },
    {
      sceneType: "manager_consultation",
      displayName: "실장상담",
      folderName: "01_실장상담",
      description: "유니폼 실장이 고객과 마주 앉아 시술 내용/비용을 설명하는 장면",
      priority: 6,
      visualCues: ["유니폼 여성", "상담실", "거울", "펜", "상담 자료", "태블릿"],
      negativeCues: ["가운/스크럽복 의사", "수술복", "주사기", "처치 도구"],
    },
    {
      sceneType: "harmony",
      displayName: "하모니컷",
      folderName: "06_하모니컷",
      description: "의사·직원·고객이 함께 웃으며 관계성을 보여주는 장면",
      priority: 7,
      visualCues: ["여러 명", "함께 웃음", "자연스러운 대화", "관계성"],
      negativeCues: ["수술 중", "주사 중", "장비 사용 중", "단독 포즈"],
    },
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "08_프로필",
      description: "정면 응시 정지 포즈의 프로필 사진",
      priority: 8,
      visualCues: ["정면 응시", "1인", "정지 포즈", "팔짱", "손 모음", "로고 배경"],
      negativeCues: ["상담 중", "치료 중", "수술 중"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "09_인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 9,
      visualCues: ["인물 없음", "로비", "상담실", "수술실"],
    },
    {
      sceneType: "reception",
      displayName: "접수안내",
      folderName: "10_접수안내",
      description: "접수대에서 직원이 고객을 응대하는 장면",
      priority: 10,
      visualCues: ["접수대", "직원", "고객 응대"],
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
