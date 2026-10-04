import { describe, expect, it } from "vitest";
import {
  buildClientOliviaRootHref,
  clearOliviaRootLaunchParams,
  parseOliviaRootLaunch,
} from "./clientRoute";

describe("clientRoute", () => {
  it("maps the legacy id parameter to the native customer app", () => {
    expect(buildClientOliviaRootHref({ id: "client-1" }))
      .toBe("/?oliviaApp=customer&clientId=client-1");
  });

  it("keeps client and workflow context", () => {
    const href = buildClientOliviaRootHref({ clientId: "client-2", workflowRunId: "run-1" });
    expect(parseOliviaRootLaunch(new URL(href, "https://olivia.local").search)).toEqual({
      appId: "customer",
      clientId: "client-2",
      workflowRunId: "run-1",
      routeHref: "/clients?clientId=client-2&workflowRunId=run-1",
    });
  });

  it("preserves the requested customer detail tab", () => {
    const href = buildClientOliviaRootHref({ clientId: "client-2", tab: "documents", document: "portrait-consent" });
    expect(parseOliviaRootLaunch(new URL(href, "https://olivia.local").search)?.routeHref)
      .toBe("/clients?clientId=client-2&tab=documents&document=portrait-consent");
  });

  it("ignores unknown root app values", () => {
    expect(parseOliviaRootLaunch("?oliviaApp=legacy-route&clientId=client-1")).toBeNull();
  });

  it("removes one-shot launch parameters without dropping the client context", () => {
    expect(clearOliviaRootLaunchParams("/?oliviaApp=customer&clientId=client-1&workflowRunId=run-1", { keepClientId: true }))
      .toBe("/?clientId=client-1");
  });

  it("clears all desktop launch context after opening the window", () => {
    expect(clearOliviaRootLaunchParams("/?oliviaApp=customer&clientId=client-1&workflowRunId=run-1"))
      .toBe("/");
  });
});
