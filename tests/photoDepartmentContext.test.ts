import { describe, expect, it } from "vitest";
import { photoDepartmentContextKey } from "@/components/photo-classifier/usePhotoDepartmentContext";

describe("photoDepartmentContextKey", () => {
  it("keeps client, workflow, and folder scopes distinct", () => {
    expect(photoDepartmentContextKey({
      clientId: "client-a",
      workflowRunId: "run-a",
      folderName: "촬영/프로젝트",
    })).toBe("client-a:run-a:촬영/프로젝트");
  });
});
