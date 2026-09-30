import type { InterviewQuestion } from "@/lib/voice/interview/types";

export const DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY = "doctor_brand_interview_v1";
export const DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION = 1;

const section = (sectionId: string, sectionTitle: string, type: InterviewQuestion["type"], questions: string[], offset: number): InterviewQuestion[] => (
  questions.map((text, index) => ({
    id: `q${String(offset + index + 1).padStart(2, "0")}`,
    number: offset + index + 1,
    sectionId,
    sectionTitle,
    text,
    type,
  }))
);

export const DOCTOR_BRAND_INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  ...section("start_direction", "① 원장님의 시작과 방향", "brand", [
    "처음 의사가 되기로 마음먹었을 때, 어떤 의사가 되고 싶었어요?",
    "이 진료 분야를 선택하게 된 특별한 계기가 있었어요?",
    "개원할 때 가장 먼저 그리고 있던 병원의 모습은 무엇이었어요?",
    "원장님 진료에 가장 큰 영향을 준 사람이나 경험은 무엇이었어요?",
    "지금의 원장님을 만든 초심을 한 단어로 표현한다면요?",
  ], 0),
  ...section("patient_experience", "② 환자에게 전하고 싶은 경험", "brand", [
    "환자분이 처음 병원에 들어올 때 어떤 기분을 느끼셨으면 해요?",
    "진료를 마치고 돌아가는 환자분에게 꼭 남기고 싶은 마음은 뭐예요?",
    "환자분들이 이 병원에서 가장 편안하게 느끼셨으면 하는 순간은 언제예요?",
    "환자분과 이야기할 때 가장 중요하게 생각하는 태도는 무엇인가요?",
    "환자분이 지인에게 이 병원을 소개한다면, 어떤 말로 소개해 주셨으면 해요?",
  ], 5),
  ...section("our_way", "③ 우리 병원만의 방식", "brand", [
    "진료할 때 원장님이 가장 중요하게 지키는 기준은 뭐예요?",
    "시간이 조금 더 걸려도 꼭 챙기는 진료 과정이 있나요?",
    "원장님 병원만의 ‘우리다운 방식’은 무엇이라고 생각하세요?",
    "환자분들이 이 병원을 선택했을 때 가장 크게 느낄 수 있는 장점은 뭐예요?",
    "원장님이 생각하는 좋은 진료의 기준은 무엇인가요?",
  ], 10),
  ...section("team_culture", "④ 팀과 병원의 문화", "brand", [
    "함께 일하는 팀에게 가장 자주 전하는 말은 뭐예요?",
    "우리 팀이 환자분들을 대하는 방식에서 가장 자랑스러운 점은 무엇인가요?",
    "병원 분위기를 가장 잘 보여주는 장면 하나를 꼽는다면요?",
    "직원분들과 함께 꼭 지켜가고 싶은 병원의 약속은 무엇인가요?",
    "환자분들이 우리 팀에서 느꼈으면 하는 인상은 뭐예요?",
  ], 15),
  ...section("trust_memory", "⑤ 신뢰와 기억", "brand", [
    "진료하면서 “이 선택이 참 좋았다”라고 느낀 순간은 언제였어요?",
    "오래 기억에 남는 환자분의 말이 있다면요?",
    "환자분들이 오래 찾아주시는 이유는 무엇이라고 생각하세요?",
    "원장님 원칙이 가장 잘 드러났던 순간은 언제였어요?",
    "원장님이 병원에서 가장 소중하게 생각하는 관계는 무엇인가요?",
  ], 20),
  ...section("future_philosophy", "⑥ 병원의 미래와 한 문장", "brand", [
    "앞으로 이 병원에서 가장 만들고 싶은 변화는 무엇인가요?",
    "10년 뒤, 환자분들이 이 병원을 어떤 곳으로 기억했으면 해요?",
    "지역에서 이 병원이 어떤 존재가 되었으면 하나요?",
    "병원 입구에 한 문장을 적는다면 어떤 말을 쓰고 싶으세요?",
    "원장님과 이 병원의 철학을 한 문장으로 표현한다면요?",
  ], 25),
  ...section("photoclinic_feedback", "포토클리닉 피드백", "feedback", [
    "이번 촬영에서 원장님과 병원의 어떤 모습이 가장 잘 담겼다고 느끼셨어요?",
    "사진을 통해 환자분들께 가장 먼저 전하고 싶은 이미지는 무엇인가요?",
    "다음 촬영에서는 병원의 어떤 강점이나 분위기를 더 담아보면 좋을까요?",
    "포토클리닉이 병원 브랜딩에 더 도움이 되려면 어떤 결과물을 더해드리면 좋을까요?",
    "이번 사진이 홈페이지나 SNS에서 병원을 소개하는 데 어떻게 활용되면 가장 좋을까요?",
  ], 30),
];

export const DOCTOR_BRAND_INTERVIEW_TEMPLATE = {
  key: DOCTOR_BRAND_INTERVIEW_TEMPLATE_KEY,
  version: DOCTOR_BRAND_INTERVIEW_TEMPLATE_VERSION,
  questions: DOCTOR_BRAND_INTERVIEW_QUESTIONS,
} as const;

export function interviewQuestionById(id: string): InterviewQuestion | null {
  return DOCTOR_BRAND_INTERVIEW_QUESTIONS.find((question) => question.id === id) ?? null;
}
