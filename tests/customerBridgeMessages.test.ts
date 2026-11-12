import { describe, expect, it } from "vitest";
import { customerBridgeUnreadIncrement } from "@/components/select-gallery/useCustomerBridgeMessages";

describe("customer Bridge message notifications", () => {
  it("does not mark the initial load or the open chat as unread", () => {
    expect(customerBridgeUnreadIncrement({
      previousLastId: null,
      nextLastId: "m1",
      previousLength: 0,
      nextLength: 1,
      viewingChat: false,
    })).toBe(0);
    expect(customerBridgeUnreadIncrement({
      previousLastId: "m1",
      nextLastId: "m2",
      previousLength: 1,
      nextLength: 2,
      viewingChat: true,
    })).toBe(0);
  });

  it("counts messages appended while the preview panel is open", () => {
    expect(customerBridgeUnreadIncrement({
      previousLastId: "m1",
      nextLastId: "m4",
      previousLength: 1,
      nextLength: 4,
      viewingChat: false,
    })).toBe(3);
  });

  it("shows at least one notification when the latest message changes", () => {
    expect(customerBridgeUnreadIncrement({
      previousLastId: "m1",
      nextLastId: "m2",
      previousLength: 3,
      nextLength: 3,
      viewingChat: false,
    })).toBe(1);
  });
});
