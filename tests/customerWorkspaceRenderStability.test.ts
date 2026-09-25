import { describe, expect, it } from "vitest";
import {
  buildWindowContextFromOlivia,
  getWindowClientSyncKey,
  resolveNamedContextSeed,
} from "@/lib/olivia/desktopContextBridgeSync";
import { areWindowContextsEqual, type WindowContext } from "@/lib/store/useOliviaDesktopStore";
import { useOliviaContextStore } from "@/lib/store/oliviaContextStore";

type ActiveClient = { id?: string; name?: string };

function settleCustomerWindow(input: {
  windowContext?: WindowContext;
  active: ActiveClient;
  previousClientKey?: readonly string[];
}) {
  let windowContext = input.windowContext;
  let active = input.active;
  let previousClientKey = input.previousClientKey;
  let mutations = 0;

  for (let render = 0; render < 20; render += 1) {
    const clientKey = getWindowClientSyncKey(windowContext ? "customer" : undefined, windowContext);
    if (!previousClientKey || clientKey.some((value, index) => value !== previousClientKey?.[index])) {
      const seed = resolveNamedContextSeed({
        windowId: windowContext ? "customer" : undefined,
        windowValue: { id: windowContext?.clientId, name: windowContext?.clientName },
        activeValue: active,
      });
      if (seed) {
        active = seed;
        mutations += 1;
      }
      previousClientKey = clientKey;
    }

    if (!windowContext) break;
    const nextWindow = buildWindowContextFromOlivia({
      appId: "customer",
      windowContext,
      oliviaContext: { clientId: active.id, clientName: active.name },
    });
    if (areWindowContextsEqual(windowContext, nextWindow)) break;
    windowContext = nextWindow;
    mutations += 1;
  }

  return { windowContext, active, previousClientKey, mutations };
}

describe("customer window render stability", () => {
  it("opens, changes customer, closes, and reopens with a finite number of context mutations", () => {
    const opened = settleCustomerWindow({
      windowContext: { clientId: "client-a", clientName: "고객 A" },
      active: {},
    });
    expect(opened.mutations).toBe(1);

    const selectedB = settleCustomerWindow({
      windowContext: opened.windowContext,
      active: { id: "client-b", name: "고객 B" },
      previousClientKey: opened.previousClientKey,
    });
    expect(selectedB.active).toEqual({ id: "client-b", name: "고객 B" });
    expect(selectedB.windowContext).toMatchObject({ clientId: "client-b", clientName: "고객 B" });
    expect(selectedB.mutations).toBeLessThanOrEqual(1);

    const closed = settleCustomerWindow({
      windowContext: undefined,
      active: selectedB.active,
      previousClientKey: selectedB.previousClientKey,
    });
    expect(closed.mutations).toBe(0);

    const reopened = settleCustomerWindow({
      windowContext: selectedB.windowContext,
      active: closed.active,
      previousClientKey: closed.previousClientKey,
    });
    expect(reopened.mutations).toBe(0);
  });

  it("does not increase Olivia context revision for identical client/project writes", () => {
    const store = useOliviaContextStore.getState();
    store.clearContext();
    store.setClient("client-a", "고객 A");
    store.setProject("workflow-a", "프로젝트 A");
    const revision = useOliviaContextStore.getState().revision;

    useOliviaContextStore.getState().setClient("client-a", "고객 A");
    useOliviaContextStore.getState().setProject("workflow-a", "프로젝트 A");

    expect(useOliviaContextStore.getState().revision).toBe(revision);
  });
});
