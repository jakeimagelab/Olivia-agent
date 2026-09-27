export type ClientStepInfo = {
  icon: string;
  desc: string;
  href: string;
};

// 고객관리와 상태표시줄이 같은 단계 설명을 사용한다. 단계 문구를 화면마다 복제하면
// 한쪽만 바뀌어 서로 다른 안내가 나가므로 이 파일을 canonical source로 둔다.
export const STEP_INFO: Record<string, ClientStepInfo> = {
  consult_meeting: { icon: "🤝", desc: "병원 기본 정보 등록, 상담 내용 AI 분析", href: "/consultation" },
  quote: { icon: "📄", desc: "패키지 선택 및 PDF 견적서 자동 생성", href: "/quote" },
  contract: { icon: "✍️", desc: "계약서 생성 및 이메일 전달", href: "/contract" },
  conti: { icon: "🎬", desc: "AI 촬영 콘티 및 체크리스트 생성", href: "/conti" },
  shooting: { icon: "📸", desc: "촬영 당일 체크리스트 진행 및 완료 처리", href: "/shooting" },
  payment_confirm: { icon: "🧾", desc: "잔금 입금과 계산서 처리 상태를 수동 확인", href: "/clients" },
  backup_sorting: { icon: "🗂️", desc: "RAW/JPG 자동 분류 및 백업 관리", href: "/photo-sorting?mode=classification" },
  original_delivery: { icon: "📦", desc: "원본 파일 NAS 링크 생성 및 발송", href: "/original-delivery" },
  client_selection: { icon: "🖼️", desc: "원본 전달부터 고객 셀렉과 RAW 매칭까지 관리", href: "/select-galleries" },
  retouching: { icon: "🎨", desc: "색감 보정 및 보정 가이드 작성", href: "/photo-retouching" },
  revision: { icon: "🔄", desc: "수정 요청 접수 및 알람 발송", href: "/mailing" },
  seo_delivery: { icon: "🔍", desc: "SEO 파일명·ALT·캡션·메타데이터 자동 생성", href: "/seo-delivery" },
  final_delivery: { icon: "🚀", desc: "최종 파일 + 후기 요청 메일 발송", href: "/delivery-mail" },
  review_content: { icon: "⭐", desc: "후기 텍스트 → 리뷰컨텐츠 자동 변환", href: "/clients/reviews" },
  reward: { icon: "🎁", desc: "PER 포인트 자동 산출 및 적립", href: "/per" },
  customer_care: { icon: "💌", desc: "주기 알람 및 이벤트 메일 발송", href: "/mailing" },
  content_planning: { icon: "✏️", desc: "블로그 기반 콘텐츠 기획 및 작성", href: "/content-writer" },
};
