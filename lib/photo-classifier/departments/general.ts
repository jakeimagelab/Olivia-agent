import type { DepartmentClassificationConfig } from "../types";

export const generalConfig: DepartmentClassificationConfig = {
  department: "general",
  displayName: "기타",
  folderNameRules: {
    prefixFormat: "NN_",
    useKoreanFolderName: true,
  },
  promptGuide: `당신은 병원 현장 사진을 분류하는 전문가입니다.
아래 6개 장면 타입 중 가장 적합한 것을 선택하세요. 세부 종류로 나누지 말고 이 6개로만 판단하세요.

장면 타입:
- profile (프로필): 사람 1명 이상, 환자 없음, 카메라를 의식한 정지 포즈, 시술/상담 행동 없음 — 단체사진도 가능
- treatment (시술): 시술 또는 처치 장면
- consultation (상담): 의사/원장과 환자 상담
- skin_care (피부관리): 피부/미용 관리 장면
- interior (인테리어): 공간/인테리어
- etc (기타): 접수/안내, 판단 어려움 등

우선순위(높을수록 먼저 적용): 프로필 > 시술 > 상담 > 피부관리 > 인테리어 > 기타
반드시 프로필 여부를 가장 먼저 검토하세요.

JSON 형식으로만 응답하세요:
{
  "sceneType": "<type>",
  "confidence": 0.0~1.0,
  "detectedCues": ["..."],
  "reason": "한국어로 짧게"
}`,
  sceneTypes: [
    {
      sceneType: "profile",
      displayName: "프로필",
      folderName: "프로필",
      description: "정지 포즈 프로필 — 1인 또는 여러 명, 환자 없음, 카메라를 의식한 포즈",
      priority: 6,
      visualCues: ["정면 응시", "정지 포즈", "1인 또는 단체"],
      negativeCues: ["환자와 함께", "시술 중", "상담 중"],
    },
    {
      sceneType: "treatment",
      displayName: "시술",
      folderName: "시술",
      description: "시술 또는 처치 장면",
      priority: 5,
      visualCues: ["장비", "시술 도구", "환자 처치 중"],
    },
    {
      sceneType: "consultation",
      displayName: "상담",
      folderName: "상담",
      description: "의사/원장과 환자 상담 장면",
      priority: 4,
      visualCues: ["의사", "환자", "상담", "진료실"],
    },
    {
      sceneType: "skin_care",
      displayName: "피부관리",
      folderName: "피부관리",
      description: "피부/미용 관리 장면",
      priority: 3,
      visualCues: ["관리 도구", "베드에 누움"],
    },
    {
      sceneType: "interior",
      displayName: "인테리어",
      folderName: "인테리어",
      description: "공간 중심 장면",
      priority: 2,
      visualCues: ["인물 없음", "공간"],
    },
    {
      sceneType: "etc",
      displayName: "기타",
      folderName: "기타",
      description: "접수/안내, 판단 어려운 컷",
      priority: 1,
      visualCues: ["접수대", "안내"],
    },
  ],
};
