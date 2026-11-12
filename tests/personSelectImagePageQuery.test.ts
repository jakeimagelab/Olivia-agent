import { describe, expect, it } from "vitest";
import { encodePersonSelectImageCursor } from "../lib/person-select/imagePaging";
import { parsePersonSelectImagePageQuery } from "../lib/person-select/server/imageRepository";

describe("person-select public image page query", () => {
  it("uses the 72-image default and normalizes NFC folder paths", () => {
    const params = new URLSearchParams({ location: "folder", folder: "가" });
    expect(parsePersonSelectImagePageQuery(params)).toMatchObject({
      location: "folder",
      folderPath: "가",
      limit: 72,
    });
  });

  it("caps oversized pages and accepts a valid cursor", () => {
    const cursor = encodePersonSelectImageCursor({ sort_order: 10, id: "00000000-0000-4000-8000-000000000010" });
    const params = new URLSearchParams({ location: "all", limit: "999", cursor });
    expect(parsePersonSelectImagePageQuery(params)).toMatchObject({ limit: 120, cursor });
  });

  it("rejects invalid locations, limits, folders, and cursors", () => {
    expect(() => parsePersonSelectImagePageQuery(new URLSearchParams({ location: "root" }))).toThrow("위치");
    expect(() => parsePersonSelectImagePageQuery(new URLSearchParams({ limit: "0" }))).toThrow("크기");
    expect(() => parsePersonSelectImagePageQuery(new URLSearchParams({ location: "folder", folder: "../C1" }))).toThrow("경로");
    expect(() => parsePersonSelectImagePageQuery(new URLSearchParams({ cursor: "broken" }))).toThrow("위치");
  });
});
