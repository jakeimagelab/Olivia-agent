import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, FolderKanban, ListChecks, UsersRound } from "lucide-react";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";

const SECTIONS: Record<string, { eyebrow: string; title: string; description: string; primaryHref: string; primaryLabel: string; items: string[] }> = {
  projects: { eyebrow: "PROJECTS", title: "프로젝트 목록", description: "고객별 촬영 프로젝트 목록이 들어올 준비가 된 영역입니다.", primaryHref: "/clients", primaryLabel: "현재 고객 관리 열기", items: ["프로젝트명과 고객 연결", "현재 단계와 담당자", "예정일과 다음 액션"] },
  board: { eyebrow: "BOARD", title: "프로젝트 보드", description: "17단계 워크플로우를 운영 단계별로 묶어 보는 보드 영역입니다.", primaryHref: "/clients", primaryLabel: "현재 칸반 열기", items: ["상담·계약", "촬영 준비·촬영", "셀렉·보정·납품"] },
  workflows: { eyebrow: "WORKFLOW", title: "프로젝트 워크플로우", description: "프로젝트별 현재 단계와 다음 액션을 관리하는 영역입니다.", primaryHref: "/workflow/tasks", primaryLabel: "워크플로우 업무 열기", items: ["17단계 진행 상태", "승인·확인 업무", "실행 기능 바로가기"] },
  issues: { eyebrow: "ISSUES", title: "지연 / 확인 필요", description: "기한이 지났거나 관리자 판단이 필요한 항목을 모읍니다.", primaryHref: "/workflow/approvals", primaryLabel: "승인 대기 열기", items: ["지연 프로젝트", "고객 응답 대기", "관리자 승인 필요"] },
  aftercare: { eyebrow: "AFTERCARE", title: "후속 관리", description: "납품 이후 후기 요청과 재계약 기회를 관리하는 영역입니다.", primaryHref: "/review-studio", primaryLabel: "후기 관리 열기", items: ["후기 요청 가능", "콘텐츠 활용 동의", "재촬영·재계약 시점"] },
};

export default async function CrmSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === "clients") redirect("/clients");
  const config = SECTIONS[section];
  if (!config) notFound();

  return (
    <div className="oa-page">
      <CategorySection eyebrow={config.eyebrow} title={config.title} description={config.description} action={<StatusBadge tone="orange">2차 연동 준비</StatusBadge>}>
        <div className="oa-placeholder-layout">
          <div className="oa-placeholder-visual">
            <span><FolderKanban size={30}/></span>
            <h2>CRM 데이터 연결 영역</h2>
            <p>이번 1차에서는 관리자 정보 구조와 이동 경로를 먼저 구성했습니다. 기존 기능은 그대로 사용할 수 있습니다.</p>
            <Link className="oa-primary-link" href={config.primaryHref}>{config.primaryLabel}<ArrowRight size={16}/></Link>
          </div>
          <aside className="oa-placeholder-checklist">
            <header><ListChecks size={19}/><strong>다음 단계 연결 항목</strong></header>
            {config.items.map(item => <div key={item}><span>✓</span><p>{item}</p></div>)}
            <div><AlertTriangle size={15}/><p>기존 기능 로직과 DB는 이번 단계에서 변경하지 않습니다.</p></div>
          </aside>
        </div>
      </CategorySection>
      <div className="oa-crm-shortcuts">
        <Link href="/admin/crm/dashboard"><FolderKanban size={18}/><span>CRM 대시보드</span></Link>
        <Link href="/clients"><UsersRound size={18}/><span>고객 목록</span></Link>
        <Link href="/workflow/tasks"><ListChecks size={18}/><span>업무 목록</span></Link>
      </div>
    </div>
  );
}
