import { describe, expect, it } from "vitest";
import { getCameraRoles, getPackingList, getSetups, type ShootSetupInput } from "./rules";

const input = (patch: Partial<ShootSetupInput>): ShootSetupInput => ({
  shootTypes: [],
  hasVideo: false,
  profileStyle: "studio",
  ...patch,
});

describe("shoot setup rules", () => {
  it("assigns a7R5 and Connect Pro for a photo-only scene shoot", () => {
    const value = input({ shootTypes: ["scene"] });
    expect(getCameraRoles(value).find((camera) => camera.name === "Sony a7R5")?.role).toBe("사진 메인");
    expect(getSetups(value).scene?.trigger).toMatchObject({ name: "Profoto Connect Pro", note: "Sony a7R5" });
    expect(getPackingList(value).some((item) => item.name.startsWith("Canon"))).toBe(false);
  });

  it("merges studio profile equipment with scene and group equipment", () => {
    const value = input({ shootTypes: ["scene", "group", "profile"] });
    expect(getPackingList(value)).toEqual(expect.arrayContaining([
      { name: "TS-5 for Canon", quantity: 1 },
      { name: "Profoto B10x", quantity: 2 },
      { name: "Black Aurora", quantity: 2 },
    ]));
  });

  it("uses B10x without TS-5 for a basic profile shoot", () => {
    const value = input({ shootTypes: ["profile"], profileStyle: "basic" });
    expect(getPackingList(value)).toContainEqual({ name: "Profoto B10x", quantity: 2 });
    expect(getPackingList(value).some((item) => item.name === "TS-5 for Canon")).toBe(false);
    expect(getPackingList(value).some((item) => item.name.startsWith("Sony a7"))).toBe(false);
  });

  it("assigns video and photo Sony roles and video equipment", () => {
    const value = input({ shootTypes: ["group"], hasVideo: true });
    const roles = getCameraRoles(value);
    expect(roles.find((camera) => camera.name === "Sony a7R5")?.role).toBe("영상 메인");
    expect(roles.find((camera) => camera.name === "Sony a7M4")?.role).toBe("사진 메인");
    expect(getSetups(value).group?.trigger).toMatchObject({ name: "Profoto Connect Pro", note: "Sony a7M4" });
    expect(getPackingList(value)).toContainEqual({ name: "Godox E300", quantity: 1 });
  });
});
