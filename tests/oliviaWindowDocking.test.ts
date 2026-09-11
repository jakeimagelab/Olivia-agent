import { describe, expect, it } from "vitest";
import { findDockParent, followDockedParent, resolveDockLayout } from "@/components/olivia-os/window/windowDocking";
import type { OliviaWindowState } from "@/lib/store/useOliviaDesktopStore";

const windowState = (id: string, appId: string, x: number, y: number, width: number, height: number): OliviaWindowState => ({
  id, appId, title: id, x, y, width, height, minimized: false, snapMode: "none", zIndex: 1,
});

describe("Olivia window docking", () => {
  it("finds a main window beside the Olivia chat", () => {
    const quote = windowState("quote", "quote", 100, 40, 700, 600);
    const chat = windowState("olivia-chat", "olivia-chat", 812, 80, 360, 520);
    expect(findDockParent(chat, [quote, chat], chat.id)?.id).toBe("quote");
  });

  it("does not dock when the windows do not overlap vertically", () => {
    const quote = windowState("quote", "quote", 100, 40, 700, 400);
    const chat = windowState("olivia-chat", "olivia-chat", 808, 600, 360, 400);
    expect(findDockParent(chat, [quote, chat], chat.id)).toBeUndefined();
  });

  it("moves the pair left and aligns the child to the parent", () => {
    const layout = resolveDockLayout(
      { x: 500, y: 40, width: 700, height: 620 },
      { x: 1210, y: 80, width: 360, height: 500 },
      1280, 900, 96,
    );
    expect(layout).not.toBeNull();
    expect(layout!.parent.x).toBe(200);
    expect(layout!.child).toMatchObject({ x: 908, y: 40, width: 360, height: 620 });
  });

  it("keeps a docked child on the parent's right while it moves and resizes", () => {
    expect(followDockedParent(
      { x: 140, y: 50, width: 760, height: 640 },
      { x: 0, y: 0, width: 360, height: 400 },
    )).toEqual({ x: 908, y: 50, width: 360, height: 640 });
  });
});
