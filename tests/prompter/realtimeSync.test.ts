import { describe, expect, it } from "vitest";
import { extendInteractionLease, isNewerSequence } from "@/lib/prompter/realtimeSync";

describe("prompter realtime ordering", () => {
  it("rejects duplicate and late frames", () => {
    expect(isNewerSequence(12, 11)).toBe(true);
    expect(isNewerSequence(11, 11)).toBe(false);
    expect(isNewerSequence(10, 11)).toBe(false);
  });

  it("accepts legacy messages without a sequence", () => {
    expect(isNewerSequence(undefined, 20)).toBe(true);
  });

  it("never shortens an active local interaction lease", () => {
    expect(extendInteractionLease(2_000, 1_000, 450)).toBe(2_000);
    expect(extendInteractionLease(1_000, 2_000, 450)).toBe(2_450);
  });
});
