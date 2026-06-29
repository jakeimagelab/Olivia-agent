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

장면 타입:
- manager_consultation (실장상담): 어두운 유니폼 여성 상담자, 앉아서 대면 상담, 흰 가운 없음, 의료장비 없음
- skin_care (피부관리): 고객이 베드에 누움, 여성 관리사, 피부관리 도구, 대형장비/주사기 없음
- doctor_consultation (원장상담): 흰 가운 의사, 앉아서 대면 설명, 장비/주사기 없음, 고객이 의자에 앉아 있음, 책상/모니터/차트/피부모형이 보임
- laser_treatment (레이저시술): 레이저 핸드피스, 보호안경, 피부 조사 장면
- device_treatment (장비시술): 대형 장비/핸드피스, 고객이 베드에 누움, 울쎄라/써마지/슈링크 등 피부 장비 시술
- injection_treatment (주사시술): 작은 주사기/시린지, 바늘, 얼굴 부위 주입, 장갑 낀 의료진
- profile (프로필): 정면 응시, 1인 단독, 정지 포즈, 팔짱/손깍지/손모음, 배경 단순, 연출된 프로필 포즈
- interior (인테리어): 인물 없이 공간 중심, 로비/상담실/시술실
- reception (접수안내): 접수대, 직원, 고객 안내, 로비 응대
- etc (ETC): 판단 어려움, 조명불량, 테스트컷

우선순위(높을수록 먼저 적용):
주사시술 > 레이저시술 > 장비시술 > 피부관리 > 원장상담 > 실장상담 > 프로필 > 인테리어 > 접수안내 > ETC

[피부과 핵심 규칙 — 반드시 준수]

원장상담(doctor_consultation)과 장비시술(device_treatment)은 반드시 구분하세요.

원장상담: 고객이 의자에 앉아 있고, 의사가 설명하거나 상담하는 장면입니다.
  - 단서: 상담실/진료실 책상, 모니터, 차트, 피부모형, 설명하는 자세
  - 금지: 환자가 베드에 누워 있음, 핸드피스 사용 중, 대형 장비/케이블 보임

장비시술: 고객이 베드에 누워 있고, 의사/시술자가 핸드피스를 얼굴/피부에 사용 중인 장면입니다.
  - 단서: 시술 베드, 핸드피스, 대형 장비 본체, 케이블, 수건, 시술실 환경
  - 금지: 고객이 의자에 앉아 있음, 책상 앞 설명 중, 장비 없음

같은 시간대에 촬영되었더라도, 고객 자세가 앉음→누움으로 바뀌거나,
상담 책상 중심에서 시술 베드 중심으로 바뀌거나,
장비/핸드피스 사용이 시작되면 다른 장면으로 분류하세요.

[프로필 엄격 규칙]

프로필 사진은 매우 엄격하게 판단하세요.
프로필은 주요 인물이 혼자 있고, 카메라를 정면으로 응시하며, 장비나 도구를 들고 있지 않고,
상담/시술/치료 중이 아니며, 팔짱/손깍지/손모음 같은 의도된 정지 포즈를 취한 사진입니다.

의료진이 환자와 함께 있거나, 환자에게 설명/시술 중이거나, 장비/핸드피스/주사기/상담도구를
들고 있으면 프로필이 아닙니다. 의료진 얼굴이 잘 보여도 프로필로 분류하지 마세요.

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
      sceneType: "injection_treatment",
      displayName: "주사시술",
      folderName: "06_주사시술",
      description: "필러, 보톡스, 스킨부스터 등 주사 시술 장면",
      priority: 1,
      visualCues: ["작은 주사기", "시린지", "바늘", "앰플", "얼굴 부위 주입", "장갑 낀 의료진"],
      negativeCues: ["대형 장비", "핸드피스"],
      contextRules: { includeNearbyWithinMinutes: 1, includeNearbyIfSamePeople: true, includeNearbyIfSameRoom: true },
    },
    {
      sceneType: "laser_treatment",
      displayName: "레이저시술",
      folderName: "04_레이저시술",
      description: "레이저 핸드피스, 보호안경, 피부 조사 장면",
      priority: 2,
      visualCues: ["레이저 핸드피스", "레이저 조사", "보호안경", "색소/토닝/제모 맥락"],
      negativeCues: ["주사기", "시린지"],
    },
    {
      sceneType: "device_treatment",
      displayName: "장비시술",
      folderName: "05_장비시술",
      description: "울쎄라, 써마지, 슈링크 등 대형 장비 사용 장면 — 환자가 베드에 누워 핸드피스 시술을 받는 장면",
      priority: 3,
      visualCues: ["대형 장비 본체", "핸드피스", "케이블", "장비 카트", "고객 베드에 누움", "리프팅 장비", "고주파 장비", "초음파 장비", "시술 베드", "수건"],
      negativeCues: ["주사기", "시린지", "고객이 의자에 앉음", "책상 앞 상담", "핸드피스 없음"],
    },
    {
      sceneType: "skin_care",
      displayName: "피부관리",
      folderName: "02_피부관리",
      description: "피부관리사의 얼굴 케어, 피부관리실 장면",
      priority: 4,
      visualCues: ["고객 베드", "피부관리 도구", "화장솜", "스패출러", "소형 도구"],
      negativeCues: ["대형 장비", "주사기", "핸드피스", "흰 가운 원장"],
    },
    {
      sceneType: "doctor_consultation",
      displayName: "원장상담",
      folderName: "03_원장상담",
      description: "흰 가운 의사의 대면 상담/설명 장면",
      priority: 5,
      visualCues: ["흰 가운", "의사", "앉아서 상담", "차트", "모니터"],
      negativeCues: ["고객 누움", "장비", "주사기"],
    },
    {
      sceneType: "manager_consultation",
      displayName: "실장상담",
      folderName: "01_실장상담",
      description: "어두운 유니폼 실장의 대면 상담 장면",
      priority: 6,
      visualCues: ["어두운 유니폼", "여성 상담자", "앉아서 대면", "거울", "상담자료"],
      negativeCues: ["흰 가운", "고객 누움", "의료장비", "핸드피스", "주사기"],
    },
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "07_프로필",
      description: "정면 응시, 정지 포즈의 프로필 사진",
      priority: 7,
      visualCues: ["정면 응시", "1인", "정지 포즈", "팔짱", "손 모음", "단순 배경"],
      negativeCues: ["장비", "주사기", "고객과 대화"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "08_인테리어",
      description: "인물 없이 공간 중심 장면",
      priority: 8,
      visualCues: ["인물 없음", "로비", "상담실", "시술실", "공간 중심"],
    },
    {
      sceneType: "reception",
      displayName: "접수안내",
      folderName: "09_접수안내",
      description: "접수대, 직원의 고객 안내 장면",
      priority: 9,
      visualCues: ["접수대", "직원", "고객 안내", "로비", "예약/접수"],
    },
    {
      sceneType: "etc",
      displayName: "ETC_확인필요",
      folderName: "00_ETC_확인필요",
      description: "판단 어려운 컷, 조명불량, 테스트컷",
      priority: 0,
      visualCues: ["판단 어려움", "조명불량", "테스트컷"],
    },
  ],
};
