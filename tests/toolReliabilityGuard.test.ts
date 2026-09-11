import { describe, expect, it } from "vitest";
import { assertToolResultVerified } from "@/lib/olivia/v2/toolExecutors/verification";
import { calendarMonthRange } from "@/lib/olivia/v2/toolExecutors/calendar";
import { runOliviaMcpExecution } from "@/lib/hermes/mcp/runTool";
import { consumeHermesToolCalls } from "@/lib/hermes/toolAudit";

describe("P0 tool reliability guards", () => {
  it("mutation의 persisted=false를 성공으로 허용하지 않는다", () => {
    expect(() => assertToolResultVerified({
      tool: "calendar_add", success: true, data: {}, verification: { executed: true, persisted: false },
    }, "mutation")).toThrow("실제 저장을 검증하지 못했어요");
  });

  it("approval은 persisted=false가 정상이다", () => {
    expect(() => assertToolResultVerified({
      tool: "request_quote_publish", success: true, data: {}, verification: { executed: true, persisted: false },
    }, "approval")).not.toThrow();
  });

  it("MCP mutation의 검증 실패는 isError와 실패 audit으로 반환한다", async () => {
    const requestId = crypto.randomUUID();
    const response = await runOliviaMcpExecution({
      exposedToolName: "calendar.add", mode: "mutation", requestId, input: {},
      execute: async () => ({ tool: "calendar_add", success: true, data: {}, verification: { executed: true, persisted: false } }),
    });
    expect(response.isError).toBe(true);
    expect(consumeHermesToolCalls(requestId)[0].result).toMatchObject({ success: false, code: "VERIFICATION_FAILED", mode: "mutation" });
  });

  it("MCP approval의 persisted=false는 정상 응답과 audit으로 반환한다", async () => {
    const requestId = crypto.randomUUID();
    const response = await runOliviaMcpExecution({
      exposedToolName: "request_contract_publish", mode: "approval", requestId, input: {},
      execute: async () => ({ tool: "request_contract_publish", success: true, data: { approvalRequired: true }, verification: { executed: true, persisted: false } }),
    });
    expect(response.isError).not.toBe(true);
    expect(consumeHermesToolCalls(requestId)[0].result).toMatchObject({ success: true, mode: "approval" });
  });

  it("MCP 성공 응답에 canonical resource linkage를 공통으로 포함한다", async () => {
    const requestId = crypto.randomUUID();
    const response = await runOliviaMcpExecution({
      exposedToolName: "create_contract", mode: "mutation", requestId, input: {},
      execute: async () => ({ tool: "create_contract", success: true, data: { contractId: "contract-1" }, verification: { executed: true, persisted: true } }),
    });
    expect(response.structuredContent).toMatchObject({ contractId: "contract-1", resourceType: "contract", resourceId: "contract-1" });
  });

  it("9월 조회는 다음 달 1일 exclusive 범위를 사용한다", () => {
    expect(calendarMonthRange("2026-09")).toEqual({ start: "2026-09-01", endExclusive: "2026-10-01" });
  });

  it("12월 조회는 다음 해 1월 1일 exclusive 범위를 사용한다", () => {
    expect(calendarMonthRange("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
});
