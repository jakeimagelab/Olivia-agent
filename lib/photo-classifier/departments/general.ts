import type { DepartmentClassificationConfig } from "../types";

export const generalConfig: DepartmentClassificationConfig = {
  department: "general",
  displayName: "기타",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 병원 현장 사진을 분류하는 전문가입니다.
아래 공통 장면 타입 중 가장 적합한 것을 선택하세요.

장면 타입:
- doctor_consultation: 의사/원장과 환자 상담
- treatment: 시술 또는 처치 장면
- profile: 정면 응시 정지 포즈
- interior: 공간/인테리어
- reception: 접수/안내 장면
- etc: 판단 어려움

JSON 형식으로만 응답하세요:
{
  "sceneType": "<type>",
  "confidence": 0.0~1.0,
  "detectedCues": ["..."],
  "reason": "한국어로 짧게"
}`,
  sceneTypes: [
    {
      sceneType: "doctor_consultation",
      displayName: "진료상담",
      folderName: "01_진료상담",
      description: "의사/원장과 환자 상담 장면",
      priority: 5,
      visualCues: ["의사", "환자", "상담", "진료실"],
    },
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "02_프로필",
      description: "정면 응시 프로필 장면",
      priority: 7,
      visualCues: ["정면 응시", "정지 포즈", "1인"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "03_인테리어",
      description: "공간 중심 장면",
      priority: 8,
      visualCues: ["인물 없음", "공간"],
    },
    {
      sceneType: "reception",
      displayName: "접수안내",
      folderName: "04_접수안내",
      description: "접수/안내 장면",
      priority: 9,
      visualCues: ["접수대", "안내"],
    },
    {
      sceneType: "etc",
      displayName: "ETC_확인필요",
      folderName: "00_ETC_확인필요",
      description: "판단 어려운 컷",
      priority: 0,
      visualCues: [],
    },
  ],
};
