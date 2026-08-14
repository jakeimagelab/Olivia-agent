// Capability Registry는 새 데이터를 만들지 않는다 — lib/olivia/features/registry.ts(=lib/toolNav.ts
// ALL_TOOLS)가 이미 사이드바/더보기/Olivia open_feature 도구가 공유하는 단일 소스이므로, 여기서는
// 그 위에 "GPT 호출 전에 결정적으로 열 수 있는가"라는 판단 레이어만 얹는다(설계 문서 10, 26절).
// 새 기능을 추가할 때도 lib/toolNav.ts에 한 줄만 등록하면 사이드바/더보기/Olivia 전부에 자동
// 반영된다 — 이 파일이나 시스템 프롬프트를 따로 손댈 필요가 없다(27절).
export { getOliviaFeatures, findFeatureByHref } from "@/lib/olivia/features/registry";
