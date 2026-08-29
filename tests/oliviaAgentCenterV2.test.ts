import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyOliviaRequest, routeOliviaModel } from "@/lib/olivia/v2/modelRouter";
import { selectOliviaTools } from "@/lib/olivia/v2/toolSelection";
import { executeOliviaToolBatch } from "@/lib/olivia/v2/toolScheduler";
import { canTransitionAgentRun, isAgentRunLeaseClaimable } from "@/lib/olivia/agentRuns/stateMachine";
import { validateWorkflowLink } from "@/lib/olivia/agentRuns/validator";
import { isStalledProject, sortRecentResults } from "@/lib/olivia/agentCenter/summary";
import { shouldCreatePersistentAgentRun } from "@/lib/olivia/v2/persistentRunClassifier";

const context={recentActions:[],revision:0};
afterEach(()=>vi.unstubAllEnvs());

describe("Olivia routing and tools",()=>{
  it("routes normal chat away from reasoning model",()=>{
    vi.stubEnv("OLIVIA_FAST_MODEL","fast");vi.stubEnv("OLIVIA_DEFAULT_MODEL","default");vi.stubEnv("OLIVIA_REASONING_MODEL","reasoning");
    expect(routeOliviaModel("NORMAL_CHAT")).toBe("default");
    expect(routeOliviaModel("REASONING")).toBe("reasoning");
    expect(routeOliviaModel("TOOL_ACTION")).toBe("fast");
  });
  it("selects only relevant quote tools",()=>{
    const requestClass=classifyOliviaRequest("견적 10만원 할인 넣어",context);
    const tools=selectOliviaTools({requestClass,message:"견적 10만원 할인 넣어",context});
    expect(tools.map((tool)=>tool.name)).toContain("apply_quote_discount");
    expect(tools.map((tool)=>tool.name)).not.toContain("email_search");
    expect(tools.length).toBeLessThanOrEqual(28);
  });
  it("견적 워크스페이스가 열려 있으면 update_quote_info(병원명/제목 등 기본정보 수정)도 포함한다 — 빠지면 도메인 밖으로 튕겨 \"직접 수정할 수 없다\"고 답하는 사고로 이어진다(2026-08-30)",()=>{
    const requestClass=classifyOliviaRequest("병원명 바꿔줘",context);
    const tools=selectOliviaTools({requestClass,message:"병원명 바꿔줘",context:{...context,activeWorkspace:"quote",activeResourceId:"quote-1"}});
    expect(tools.map((tool)=>tool.name)).toContain("update_quote_info");
  });
  it("계약 워크스페이스가 열려 있으면 update_contract_terms/request_contract_signature/request_contract_publish도 포함한다(PHASE 3, 2026-08-30) — 같은 도메인 누락 버그 재발 방지",()=>{
    const requestClass=classifyOliviaRequest("계약금 30%로 해",context);
    const tools=selectOliviaTools({requestClass,message:"계약금 30%로 해",context:{...context,activeWorkspace:"contract",activeResourceId:"contract-1"}}).map((tool)=>tool.name);
    expect(tools).toContain("update_contract_terms");
    expect(tools).toContain("request_contract_signature");
    expect(tools).toContain("request_contract_publish");
  });
  it("parallelizes read calls and serializes writes",async()=>{
    let active=0;let maxActive=0;
    const execute=async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise((resolve)=>setTimeout(resolve,8));active--;return true};
    await executeOliviaToolBatch([{id:"1",name:"calendar_list",arguments:"{}"},{id:"2",name:"get_urgent_insights",arguments:"{}"}],execute);
    expect(maxActive).toBe(2);
    active=0;maxActive=0;
    await executeOliviaToolBatch([{id:"1",name:"calendar_add",arguments:"{}"},{id:"2",name:"calendar_update",arguments:"{}"}],execute);
    expect(maxActive).toBe(1);
  });
});

describe("persistent Agent Runs",()=>{
  it("detects multi-step work without capturing simple chat",()=>{
    expect(shouldCreatePersistentAgentRun("히어병원 촬영 준비해줘","TOOL_ACTION")).toBe(true);
    expect(shouldCreatePersistentAgentRun("안녕","NORMAL_CHAT")).toBe(false);
  });
  it("enforces transitions and approval resume",()=>{
    expect(canTransitionAgentRun("running","waiting_approval")).toBe(true);
    expect(canTransitionAgentRun("waiting_approval","running")).toBe(true);
    expect(canTransitionAgentRun("completed","running")).toBe(false);
  });
  it("claims only queued or expired execution leases",()=>{
    const now=new Date("2026-08-22T10:00:00Z");
    expect(isAgentRunLeaseClaimable("queued",null,now)).toBe(true);
    expect(isAgentRunLeaseClaimable("running","2026-08-22T09:59:00Z",now)).toBe(true);
    expect(isAgentRunLeaseClaimable("running","2026-08-22T10:01:00Z",now)).toBe(false);
    expect(isAgentRunLeaseClaimable("waiting_approval",null,now)).toBe(false);
  });
  it("validates workflow ownership before execution",()=>{
    expect(validateWorkflowLink({client_id:"a"},{client_id:"a"}).valid).toBe(true);
    expect(validateWorkflowLink({client_id:"a"},{client_id:"b"}).valid).toBe(false);
  });
});

describe("Agent Center summary helpers",()=>{
  it("classifies stalled projects and sorts completed results",()=>{
    const now=new Date("2026-08-22T00:00:00Z");
    expect(isStalledProject({status:"active",updated_at:"2026-08-01T00:00:00Z"},now)).toBe(true);
    expect(isStalledProject({status:"completed",updated_at:"2026-08-01T00:00:00Z"},now)).toBe(false);
    const sorted=sortRecentResults([{id:"old",completed_at:"2026-08-20"},{id:"new",completed_at:"2026-08-21"}]);
    expect(sorted.map((row)=>row.id)).toEqual(["new","old"]);
  });
});
