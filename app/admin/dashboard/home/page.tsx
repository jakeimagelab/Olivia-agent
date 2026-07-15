import Link from "next/link";
import {
  AlertTriangle, CalendarDays, Camera, CheckCircle2, Clock3, ExternalLink,
  Images, Mail, Scissors, Sparkles, Target, WandSparkles,
} from "lucide-react";
import SummaryCard from "@/components/admin/SummaryCard";
import ActionCard from "@/components/admin/ActionCard";
import OliviaRecommendationPanel from "@/components/admin/OliviaRecommendationPanel";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";

const DEMO_SUMMARY = [
  { label: "오늘 할 일", value: "12", description: "완료 4 · 남음 8", icon: <CheckCircle2 size={20}/>, tone: "blue" as const },
  { label: "촬영 예정", value: "1", description: "오늘 오후 2시", icon: <Camera size={20}/>, tone: "orange" as const },
  { label: "메일 대기", value: "4", description: "발송 확인 필요", icon: <Mail size={20}/>, tone: "green" as const },
  { label: "셀렉 완료", value: "2", description: "다음 단계 이동 가능", icon: <Images size={20}/>, tone: "blue" as const },
  { label: "RAW 매칭 필요", value: "2", description: "신규 작업", icon: <Scissors size={20}/>, tone: "orange" as const },
  { label: "지연 프로젝트", value: "3", description: "오늘 확인 권장", icon: <AlertTriangle size={20}/>, tone: "red" as const },
];

const DEMO_ACTIONS = [
  { title: "메일 발송 대기 4건", description: "자동 생성된 초안의 수신자와 첨부 파일을 확인한 뒤 발송하세요.", meta: "통합 메일링", status: "확인 필요", href: "/mailing" },
  { title: "오블리브의원 원본 셀렉 대기 2일차", description: "고객 셀렉 진행 여부를 확인하고 필요하면 링크를 다시 보내세요.", meta: "고객 셀렉", status: "대기 2일", href: "/select-galleries" },
  { title: "브라보마취통증의학과 RAW 매칭 필요", description: "셀렉 완료 파일과 원본 RAW를 연결할 준비가 됐습니다.", meta: "사진 작업", status: "작업 가능", href: "/select-match" },
  { title: "심포니성형외과 보정 전달 대기", description: "최종 파일 검수 후 고객 전달 단계로 이동하세요.", meta: "보정 관리", status: "검수 필요", href: "/photo-retouching" },
  { title: "운정표병원 후기 요청 가능", description: "최종 납품을 완료해 후기 요청 메시지를 보낼 수 있습니다.", meta: "후속 관리", status: "추천", href: "/review-studio" },
];

export default function AdminDashboardHomePage() {
  return (
    <div className="oa-page">
      <div className="oa-preview-note"><Sparkles size={14}/><span>1차 관리자 UI 시안입니다. 숫자와 업무 목록은 2차 데이터 연동을 위한 프레젠테이션 값입니다.</span></div>

      <section className="oa-summary-grid" aria-label="운영 현황 요약">
        {DEMO_SUMMARY.map(item => <SummaryCard key={item.label} {...item}/>) }
      </section>

      <div className="oa-dashboard-layout">
        <div className="oa-main-column">
          <CategorySection
            eyebrow="TODAY"
            title="오늘 처리할 업무"
            description="지금 움직이면 다음 단계로 넘길 수 있는 업무입니다."
            action={<StatusBadge tone="blue">우선순위 4</StatusBadge>}
          >
            <div className="oa-action-list">
              {DEMO_ACTIONS.map(item => <ActionCard key={item.title} {...item}/>) }
            </div>
          </CategorySection>

          <CategorySection
            eyebrow="SCHEDULE"
            title="오늘의 촬영 일정"
            description="촬영과 상담 일정을 시간 순서로 확인하세요."
            action={<Link className="oa-text-link" href="/calendar">캘린더 열기 <ExternalLink size={13}/></Link>}
          >
            <div className="oa-timeline">
              <div className="oa-timeline-item is-active"><time>10:30</time><span className="oa-timeline-dot"/><div><strong>오블리브의원 사전 상담</strong><p>브랜드 촬영 범위와 의료진 프로필 구성 확인</p></div><StatusBadge tone="blue">상담</StatusBadge></div>
              <div className="oa-timeline-item"><time>14:00</time><span className="oa-timeline-dot"/><div><strong>리움피부과 브랜드 촬영</strong><p>원장 프로필 · 공간 · 진료 연출 촬영</p></div><StatusBadge tone="orange">촬영</StatusBadge></div>
              <div className="oa-timeline-item"><time>17:30</time><span className="oa-timeline-dot"/><div><strong>당일 파일 백업 확인</strong><p>NAS 업로드와 이중 백업 상태 점검</p></div><StatusBadge tone="gray">운영</StatusBadge></div>
            </div>
          </CategorySection>
        </div>

        <aside className="oa-right-column" aria-label="운영 보조 패널">
          <OliviaRecommendationPanel items={[
            "셀렉 대기 3일차 고객에게 리마인드 메일을 보내세요.",
            "RAW 매칭 완료 고객 2건의 보정 단계를 시작하세요.",
            "최종 납품 완료 고객 3건에 후기 요청을 보내세요.",
          ]}/>

          <CategorySection eyebrow="NOTICE" title="최근 알림">
            <div className="oa-compact-list">
              <div><span className="oa-mini-icon is-orange"><Mail size={15}/></span><p><strong>메일 초안 2건 생성</strong><small>12분 전</small></p></div>
              <div><span className="oa-mini-icon is-blue"><Images size={15}/></span><p><strong>고객 셀렉 완료</strong><small>38분 전</small></p></div>
              <div><span className="oa-mini-icon is-green"><Target size={15}/></span><p><strong>워크플로우 단계 이동</strong><small>1시간 전</small></p></div>
            </div>
          </CategorySection>

          <CategorySection eyebrow="ACTIVITY" title="최근 활동">
            <ol className="oa-activity-list">
              <li><span/><div><strong>오블리브의원</strong><p>셀렉 갤러리 링크를 열었습니다.</p></div><time>방금</time></li>
              <li><span/><div><strong>브라보마취통증의학과</strong><p>프로젝트가 RAW 매칭 단계로 이동했습니다.</p></div><time>24분 전</time></li>
              <li><span/><div><strong>심포니성형외과</strong><p>보정 파일 검수가 완료되었습니다.</p></div><time>1시간 전</time></li>
            </ol>
          </CategorySection>

          <CategorySection eyebrow="QUICK" title="빠른 실행">
            <div className="oa-quick-grid">
              <Link href="/memo"><WandSparkles size={18}/><span>메모 작성</span></Link>
              <Link href="/calendar"><CalendarDays size={18}/><span>일정 추가</span></Link>
              <Link href="/mailing"><Mail size={18}/><span>메일 확인</span></Link>
              <Link href="/admin/tools"><Clock3 size={18}/><span>기능 열기</span></Link>
            </div>
          </CategorySection>
        </aside>
      </div>
    </div>
  );
}
