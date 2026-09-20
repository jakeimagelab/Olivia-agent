import { getSupabaseAdmin } from "@/lib/supabase";

export const HERMES_MCP_SIGNAL_KEY = "hermes_mcp_list_tools";

/** MCP 연결 신호 기록 실패가 실제 ListTools 응답을 막아서는 안 된다. */
export async function recordHermesMcpListTools(toolCount: number): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await getSupabaseAdmin()
      .from("system_status_signals")
      .upsert({
        signal_key: HERMES_MCP_SIGNAL_KEY,
        last_seen_at: now,
        tool_count: Math.max(0, Math.trunc(toolCount)),
        updated_at: now,
      }, { onConflict: "signal_key" });
    if (error) console.warn("[system-status] MCP ListTools 신호 기록 실패", error.message);
  } catch (error) {
    console.warn("[system-status] MCP ListTools 신호 기록 실패", error instanceof Error ? error.message : error);
  }
}
