import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OliviaErrorView } from "@/components/errors/OliviaErrorView";
import {
  formatOliviaErrorDetails,
  getOliviaErrorDiagnostic,
  logOliviaError,
} from "@/lib/errors/errorDiagnostics";

afterEach(() => vi.restoreAllMocks());

describe("Olivia error diagnostics", () => {
  it("keeps the original error message, stack and Next digest visible", () => {
    const error = Object.assign(new Error("문서 창 렌더링 실패"), { digest: "route-123" });
    const diagnostic = getOliviaErrorDiagnostic(error);

    expect(diagnostic).toMatchObject({
      name: "Error",
      message: "문서 창 렌더링 실패",
      digest: "route-123",
    });
    expect(formatOliviaErrorDetails(error)).toContain("문서 창 렌더링 실패");
    expect(formatOliviaErrorDetails(error)).toContain("digest: route-123");
  });

  it("logs the failing scope and window context without throwing", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    logOliviaError("app-window", error, { appId: "documents", windowId: "window-1" });

    expect(consoleError).toHaveBeenCalledWith(
      "[olivia-error] app-window",
      expect.objectContaining({
        scope: "app-window",
        message: "boom",
        context: { appId: "documents", windowId: "window-1" },
        error,
      }),
    );
  });

  it("turns non-Error values into a readable diagnostic", () => {
    expect(getOliviaErrorDiagnostic({ message: "Supabase 연결 실패" })).toEqual({
      name: "UnknownError",
      message: "Supabase 연결 실패",
    });
  });

  it("renders the original message and failing location in the custom error screen", () => {
    const markup = renderToStaticMarkup(createElement(OliviaErrorView, {
      error: new Error("고객 문서 연결 실패"),
      location: "documents · window-42",
      onRetry: () => undefined,
    }));

    expect(markup).toContain("오류 원문 보기");
    expect(markup).toContain("고객 문서 연결 실패");
    expect(markup).toContain("documents · window-42");
    expect(markup).toContain("다시 시도");
  });
});
