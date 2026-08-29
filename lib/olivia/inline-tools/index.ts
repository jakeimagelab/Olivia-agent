export * from "@/lib/olivia/inline-tools/types";
export * from "@/lib/olivia/inline-tools/registry";
// builtins.ts를 import하는 것 자체가 registerInlineTool() side effect를 일으킨다 — 아래 named
// export가 이미 그 import를 강제하므로 별도 `import "./builtins"`가 필요 없다.
export { SELECT_MATCH_TOOL_ID } from "@/lib/olivia/inline-tools/builtins";
