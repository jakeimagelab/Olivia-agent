import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRunnerInvocation } from "@/lib/remote-jobs/node/workerRunnerInvocation";

const repoRoot = process.cwd();

describe("Mac Studio worker runner invocation", () => {
  it.each([
    "PING",
    "COPY_TEST",
    "LIST_FOLDER",
    "PERSON_SELECT_LIST_FOLDER",
    "PHOTO_CHECK_WORK_FOLDER",
    "PHOTO_RAW_MATCH_COPY",
  ])("leaves %s to the built-in executor", (action) => {
    expect(createRunnerInvocation({ action, payload: {} }, repoRoot)).toBeNull();
  });

  it("maps person-select RAW marks to the dedicated runner", () => {
    const invocation = createRunnerInvocation({
      action: "PERSON_SELECT_RAW_MATCH",
      payload: {
        event_id: "018e2f30-92af-78b1-8f21-67f4404f5027",
        mode: "mark",
        source: "current",
        clear_mark: true,
        labelNames: { 6: "Select", 7: "Second", 8: "Approved", 9: "Review" },
      },
    }, repoRoot);

    expect(invocation?.args).toContain(path.join(repoRoot, "scripts/person-select-raw-match.ts"));
    expect(invocation?.args).toEqual(expect.arrayContaining([
      "--mode", "mark", "--source", "current", "--clear-mark", "--label-names-json",
    ]));
  });

  it("serializes selected RAW names into one CLI argument", () => {
    const invocation = createRunnerInvocation({
      action: "PHOTO_RAW_MATCH",
      payload: {
        project_relative_path: "촬영/푸른안과",
        selected_file_names: ["A.JPG", "B.JPG"],
      },
    }, repoRoot);
    expect(invocation?.args).toEqual(expect.arrayContaining([
      "--selected-file-names-json", JSON.stringify(["A.JPG", "B.JPG"]),
    ]));
  });

  it("rejects incomplete and unsupported runner jobs", () => {
    expect(() => createRunnerInvocation({ action: "PHOTO_RETOUCH", payload: {
      project_relative_path: "촬영/푸른안과",
    } }, repoRoot)).toThrow("file_names");
    expect(() => createRunnerInvocation({ action: "UNKNOWN", payload: {} }, repoRoot)).toThrow("지원하지 않는 Worker action");
  });
});
