import type { FunctionTool } from "openai/resources/responses/responses";
import { OLIVIA_V2_TOOLS } from "@/lib/olivia/v2/toolExecutor";

const CLIENT_CHAT_TOOL_NAMES = new Set([
  "get_quote", "update_quote_item", "add_quote_item", "remove_quote_item",
  "update_quote_info", "update_quote_payment_terms", "apply_quote_discount",
  "preview_quote", "request_quote_publish",
  "get_contract", "create_contract", "update_contract_terms",
  "request_contract_signature", "request_contract_publish",
  "client_get", "client_update",
  "calendar_list", "calendar_add", "calendar_update",
]);

/** 고객 화면에서는 이 고정 목록만 모델에 제공한다. */
export const CLIENT_CHAT_TOOLS = OLIVIA_V2_TOOLS.filter((tool) =>
  CLIENT_CHAT_TOOL_NAMES.has(tool.name),
) as FunctionTool[];
