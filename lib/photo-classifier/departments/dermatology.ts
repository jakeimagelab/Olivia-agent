import type { DepartmentClassificationConfig } from "../types";

export const dermatologyConfig: DepartmentClassificationConfig = {
  department: "dermatology",
  displayName: "피부과",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 피부과 현장 사진을 분류하는 전문가입니다.
아래 장면 타입 중 하나를 선택하고, 해당 장면의 시각적 단서와 확신도(0~1)를 함께 반환하세요.
카테고리는 6개뿐입니다 — 세부 시술 종류(주사/레이저/장비)로 나누지 말고 전부 "시술"로 판단하세요.

장면 타입:
- profile (프로필): 사람 1명 이상, 환자 없음, 카메라를 의식한 정지 포즈, 시술/상담/의료행위 없음 — 의료진 단독이든 2인 이상 단체든 위 조건만 맞으면 프로필
- treatment (시술): 주사(필러/보톡스/스킨부스터), 레이저, 장비(울쎄라/써마지/슈링크 등) 시술 전부 포함 — 장비/핸드피스/주사기/시술 베드, 환자가 눕거나 시술을 받는 중
- consultation (상담): 원장 또는 실장이 고객과 마주 앉아 설명하는 장면 — 책상/모니터/차트/피부모형, 장비·주사기 없음
- skin_care (피부관리): 고객이 베드에 누움, 피부관리사, 화장솜/스패출러 같은 소형 관리 도구, 대형장비·주사기 없음
- interior (인테리어): 인물 없이 공간 중심, 로비/상담실/시술실
- etc (기타): 접수안내, 하모니컷, 판단 어려움, 조명불량, 테스트컷 등 위 5개 어디에도 안 맞는 것

우선순위(높을수록 먼저 적용): 프로필 > 시술 > 상담 > 피부관리 > 인테리어 > 기타
반드시 프로필 여부를 가장 먼저 검토하세요.

[핵심 규칙]

상담(consultation)과 시술(treatment)은 반드시 구분하세요.
상담: 고객이 의자에 앉아 있고, 설명하거나 상담하는 장면입니다.
  - 단서: 상담실/진료실 책상, 모니터, 차트, 피부모형, 설명하는 자세
  - 금지: 환자가 베드에 누워 있음, 핸드피스 사용 중, 대형 장비/케이블 보임
시술: 고객이 베드에 누워 있거나, 주사/레이저/장비로 실제 시술을 받는 중인 장면입니다.
  - 단서: 시술 베드, 핸드피스, 주사기, 대형 장비 본체, 케이블, 시술실 환경
  - 금지: 고객이 의자에 앉아 책상 앞에서 설명만 듣는 중

같은 시간대에 촬영되었더라도, 고객 자세가 앉음→누움으로 바뀌거나,
상담 책상 중심에서 시술 베드/장비 중심으로 바뀌면 다른 장면으로 분류하세요.

[프로필 판정 규칙]

프로필은 아래를 모두 만족해야 합니다:
- 사람이 1명 이상 (의료진 단독, 2인, 3인, 단체사진 모두 가능 — 인원수로 제외하지 마세요)
- 환자가 없음
- 카메라를 의식한 포즈 (정면 응시, 또는 팔짱/손깍지/손모음 같은 의도된 정지 포즈)
- 시술 행동 없음 (핸드피스/주사기/장비 사용 중이 아님)
- 상담 행동 없음 (환자에게 설명 중이 아님, 차트/펜 들고 있지 않음)
- 의료행위 없음

의료진이 여러 명이어도 카메라를 보고 정지 포즈를 취했다면 프로필입니다.
반대로 1명이어도 환자와 함께 있거나 시술/상담 중이면 프로필이 아닙니다.

JSON 형식으로만 응답하세요:
{
  "sceneType": "<type>",
  "confidence": 0.0~1.0,
  "detectedCues": ["..."],
  "negativeCues": ["..."],
  "reason": "한국어로 짧게",
  "patientPosture": "seated|lying_down|standing|unclear",
  "hasTreatmentDevice": true|false,
  "hasHandpiece": true|false,
  "hasTreatmentBed": true|false,
  "hasConsultationDesk": true|false
}`,
  sceneTypes: [
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "프로필",
      description: "촬영자가 연출한 정지 포즈 프로필 사진 — 1인 또는 여러 명, 환자 없음, 카메라를 의식한 포즈, 시술/상담 행동 없음",
      priority: 6,
      visualCues: ["정면 응시", "정지 포즈", "팔짱", "손깍지", "손모음", "단순 배경", "로고 배경", "의도된 연출", "1인 또는 단체"],
      negativeCues: ["환자와 함께", "환자에게 설명 중", "시술 중", "치료 중", "상담 중", "장비 사용", "핸드피스", "주사기", "차트", "펜", "환자 피부 만지는 중"],
    },
    {
      sceneType: "treatment",
      displayName: "시술",
      folderName: "시술",
      description: "필러·보톡스·스킨부스터 등 주사 시술, 레이저 조사, 울쎄라·써마지·슈링크 등 장비 시술을 모두 포함 — 환자가 베드에 눕거나 실제 시술을 받는 중",
      priority: 5,
      visualCues: ["작은 주사기", "시린지", "바늘", "앰플", "얼굴 부위 주입", "레이저 핸드피스", "레이저 조사", "보호안경", "대형 장비 본체", "케이블", "장비 카트", "고객 베드에 누움", "리프팅 장비", "고주파 장비", "초음파 장비", "시술 베드", "장갑 낀 의료진"],
      negativeCues: ["고객이 의자에 앉음", "책상 앞 상담", "장비·핸드피스·주사기 없음"],
      contextRules: { includeNearbyWithinMinutes: 1, includeNearbyIfSamePeople: true, includeNearbyIfSameRoom: true },
    },
    {
      sceneType: "consultation",
      displayName: "상담",
      folderName: "상담",
      description: "원장 또는 실장이 고객과 마주 앉아 상담하는 장면 — 고객이 의자에 앉아 있고 핸드피스/장비 사용 없음",
      priority: 4,
      visualCues: ["흰 가운", "어두운 유니폼", "고객이 의자에 앉음", "앉아서 대면 상담", "책상", "모니터", "차트", "피부모형", "설명하는 자세", "거울", "상담자료"],
      negativeCues: ["고객이 베드에 누움", "핸드피스 사용", "대형 장비", "케이블", "주사기", "시술 베드"],
    },
    {
      sceneType: "skin_care",
      displayName: "피부관리",
      folderName: "피부관리",
      description: "피부관리사의 얼굴 케어, 피부관리실 장면",
      priority: 3,
      visualCues: ["고객 베드", "피부관리 도구", "화장솜", "스패출러", "소형 도구"],
      negativeCues: ["대형 장비", "주사기", "핸드피스", "흰 가운 원장"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 2,
      visualCues: ["인물 없음", "로비", "상담실", "시술실", "공간 중심"],
    },
    {
      sceneType: "etc",
      displayName: "기타",
      folderName: "기타",
      description: "접수안내, 하모니컷, 판단 어려운 컷, 조명불량, 테스트컷 등 위 5개 카테고리에 해당하지 않는 장면",
      priority: 1,
      visualCues: ["접수대", "직원 안내", "여러 명이 함께 웃음", "판단 어려움", "조명불량", "테스트컷"],
    },
  ],
};
