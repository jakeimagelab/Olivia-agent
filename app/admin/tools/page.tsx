import {
  Camera, FileSignature, FileText, GalleryHorizontalEnd, Gift, ImagePlus,
  Images, Search, SlidersHorizontal, Sparkles, Star, WandSparkles,
} from "lucide-react";
import FeatureCard from "@/components/admin/FeatureCard";
import CategorySection from "@/components/admin/CategorySection";
import StatusBadge from "@/components/admin/StatusBadge";

const TOOLS = [
  { slug: "quote", title: "견적서 생성기", description: "촬영 패키지와 옵션을 선택해 견적서를 작성합니다.", icon: <FileText size={22}/>, tags: ["문서", "영업"] },
  { slug: "contract", title: "계약서 생성기", description: "촬영 계약서를 만들고 고객 서명 단계로 연결합니다.", icon: <FileSignature size={22}/>, tags: ["문서", "계약"] },
  { slug: "conti", title: "콘티 생성기", description: "사진·영상 촬영의 장면 구성과 체크리스트를 제작합니다.", icon: <Images size={22}/>, tags: ["촬영", "기획"] },
  { slug: "photo-sorting", title: "사진 분류기", description: "RAW/JPG를 분류하고 고객 셀렉 작업을 준비합니다.", icon: <ImagePlus size={22}/>, tags: ["파일작업", "자동화"] },
  { slug: "select-galleries", title: "셀렉 갤러리", description: "고객이 사진을 고를 수 있는 전용 갤러리를 만듭니다.", icon: <GalleryHorizontalEnd size={22}/>, tags: ["고객 전달", "셀렉"] },
  { slug: "raw-matching", title: "RAW 자동 매칭", description: "고객 셀렉 결과와 RAW 원본 파일을 빠르게 연결합니다.", icon: <Camera size={22}/>, tags: ["파일작업", "매칭"] },
  { slug: "retouching", title: "보정 관리", description: "사진 보정 기준과 진행 상태, 최종 전달을 관리합니다.", icon: <WandSparkles size={22}/>, tags: ["보정", "품질관리"] },
  { slug: "seo-delivery", title: "AI 검색 최적화 납품", description: "파일명·ALT·캡션·메타데이터를 검색에 맞게 생성합니다.", icon: <Search size={22}/>, tags: ["AI", "납품"] },
  { slug: "reviews", title: "후기 DB", description: "고객 후기를 모으고 콘텐츠 활용 상태를 관리합니다.", icon: <Star size={22}/>, tags: ["후기", "콘텐츠"] },
  { slug: "rewards", title: "리워드 관리", description: "리워드 상품과 지급, 사용 현황을 관리합니다.", icon: <Gift size={22}/>, tags: ["고객 관리", "리워드"] },
  { slug: "content", title: "콘텐츠 제작", description: "블로그·SNS·네이버 플레이스용 콘텐츠를 제작합니다.", icon: <Sparkles size={22}/>, tags: ["콘텐츠", "AI"] },
];

const CONTEXT_KEYS = ["clientId", "projectId", "workflowRunId", "stepKey"] as const;

export default async function AdminToolsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const context = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value) context.set(key, value);
  }
  const linked = context.size > 0;
  const suffix = linked ? `?${context.toString()}` : "";

  return (
    <div className="oa-page oa-tools-page">
      <section className={`oa-context-banner${linked ? " is-linked" : ""}`}>
        <span className="oa-context-banner__icon"><Camera size={19}/></span>
        <div className="oa-context-banner__copy">
          <strong>{linked ? "고객 프로젝트와 연결된 작업입니다." : "현재 고객과 연결되지 않은 독립 작업입니다."}</strong>
          <p>{linked ? [params.clientId && `고객 ${params.clientId}`, params.projectId && `프로젝트 ${params.projectId}`, params.workflowRunId && `워크플로우 ${params.workflowRunId}`].filter(Boolean).join(" · ") : "도구를 바로 실행하거나, 추후 CRM에서 고객과 프로젝트를 선택해 연결할 수 있습니다."}</p>
        </div>
        {linked ? <a className="oa-context-banner__action" href="/admin/crm/dashboard">CRM으로 돌아가기</a> : <a className="oa-context-banner__action" href="/admin/crm/clients">고객 선택해서 연결하기</a>}
      </section>

      <CategorySection
        eyebrow="WORK TOOLS"
        title="실제 작업 도구"
        description="각 기능은 고객 연결 없이도 독립적으로 실행할 수 있습니다."
        action={<StatusBadge tone="blue">11개 기능</StatusBadge>}
      >
        <div className="oa-tool-toolbar" aria-label="기능 탐색 도구">
          <label className="oa-tool-search">
            <Search size={15} aria-hidden="true"/>
            <span className="oa-visually-hidden">기능 검색</span>
            <input type="search" placeholder="기능 이름 검색" />
          </label>
          <div className="oa-tool-filters" aria-label="기능 카테고리">
            <button className="is-active" type="button">전체</button>
            <button type="button">문서</button>
            <button type="button">사진</button>
            <button type="button">고객</button>
            <button type="button" aria-label="필터 설정"><SlidersHorizontal size={14} aria-hidden="true"/></button>
          </div>
        </div>
        <div className="oa-feature-grid">
          {TOOLS.map(tool => <FeatureCard key={tool.slug} title={tool.title} description={tool.description} href={`/admin/tools/${tool.slug}${suffix}`} icon={tool.icon} tags={tool.tags} status="사용 가능"/>)}
        </div>
      </CategorySection>
    </div>
  );
}
