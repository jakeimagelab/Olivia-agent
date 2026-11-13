import { describe, expect, it } from "vitest";

import { resolveOliviaBridgeRemoteProjectSelection } from "@/components/olivia-bridge/useOliviaBridgeFolderSession";

describe("Olivia Bridge folder session", () => {
  it("passes a normal NAS folder through unchanged", () => {
    const folder = {
      rootName: "NAS",
      path: "촬영/프로젝트",
      displayPath: "NAS/촬영/프로젝트",
    };

    expect(resolveOliviaBridgeRemoteProjectSelection(folder)).toEqual(folder);
  });

  it("hands the project root to embedded tools when Bridge is inside JPG전체", () => {
    expect(resolveOliviaBridgeRemoteProjectSelection({
      rootName: "NAS",
      path: "촬영/프로젝트/JPG전체",
      displayPath: "NAS/촬영/프로젝트/JPG전체",
    })).toMatchObject({
      path: "촬영/프로젝트",
      displayPath: "NAS/촬영/프로젝트",
    });
  });

  it("keeps an empty session without inventing a remote selection", () => {
    expect(resolveOliviaBridgeRemoteProjectSelection(null)).toBeUndefined();
  });
});
