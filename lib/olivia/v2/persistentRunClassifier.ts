import type { OliviaRequestClass } from "./modelRouter";

const COMPLEX_WORK_PATTERN=/(준비해줘|준비하자|끝까지\s*처리|전체\s*(업무|과정)|알아서\s*(진행|처리)|여러\s*단계)/i;
const WORK_DOMAIN_PATTERN=/(촬영|견적|계약|납품|프로젝트|워크플로|캠페인)/i;

export function shouldCreatePersistentAgentRun(message:string, requestClass:OliviaRequestClass){
  return requestClass==="TOOL_ACTION" && COMPLEX_WORK_PATTERN.test(message) && WORK_DOMAIN_PATTERN.test(message);
}

export function inferPersistentRunType(message:string){
  if(/촬영/.test(message)) return "shoot-prep";
  if(/견적/.test(message)) return "quote-prep";
  if(/계약/.test(message)) return "contract-prep";
  if(/납품/.test(message)) return "delivery";
  return "general";
}

export function inferPersistentRunClientName(message:string){
  const match=message.match(/^(.+?)\s+(?:촬영|견적|계약|납품|프로젝트|워크플로)/);
  return match?.[1]?.trim();
}
