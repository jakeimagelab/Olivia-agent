import { describe, expect, it } from "vitest";

import { resolveRawMatchDestinationDirectories } from "@/lib/selectMatch/rawMatchDestination";

describe("RAW 복사 목적지", () => {
  it("유일한 이름은 Selected_RAW 바로 아래에 둔다", () => {
    expect(resolveRawMatchDestinationDirectories(["C1/A.CR2", "C2/B.CR2"]))
      .toEqual(["Selected_RAW", "Selected_RAW"]);
  });

  it("같은 이름은 원본 상대 폴더를 보존해 충돌을 막는다", () => {
    expect(resolveRawMatchDestinationDirectories(["C1/_AK_0008.CR2", "C2/_AK_0008.CR2"]))
      .toEqual(["Selected_RAW/C1", "Selected_RAW/C2"]);
  });
});
