import { beforeEach, describe, expect, it, vi } from "vitest";

import { LongPress, type ScreenPoint } from "./longPress";

let time: number;
let onLongPress: ReturnType<typeof vi.fn<(point: ScreenPoint) => void>>;
let press: LongPress;
const finger = (x = 100, y = 200) => ({ x, y });

const wait = (ms: number) => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  time = 10_000;
  onLongPress = vi.fn();
  press = new LongPress(onLongPress, { now: () => time });
  return () => vi.useRealTimers();
});

describe("LongPress", () => {
  it("fires after holding still", () => {
    press.touchStart([finger()]);
    wait(540);
    expect(onLongPress).not.toHaveBeenCalled();
    wait(20);
    expect(onLongPress).toHaveBeenCalledExactlyOnceWith(finger());
  });

  it("does not fire for a tap", () => {
    press.touchStart([finger()]);
    wait(200);
    press.touchEnd();
    wait(1_000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("allows a trembling finger, but not a drag", () => {
    press.touchStart([finger(100, 200)]);
    press.touchMove([finger(106, 204)]);
    wait(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    press.touchStart([finger(100, 200)]);
    press.touchMove([finger(112, 200)]);
    wait(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire while pinching", () => {
    press.touchStart([finger()]);
    press.touchStart([finger(), finger(300, 300)]);
    wait(1_000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("does not fire when the map starts to move", () => {
    press.touchStart([finger()]);
    press.cancel();
    wait(1_000);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it("recognises the click that follows a touch", () => {
    press.touchStart([finger()]);
    wait(600); // long press
    wait(300);
    press.touchEnd();
    wait(50);
    expect(press.isEcho()).toBe(true);
  });

  it("does not mistake a mouse click for one", () => {
    expect(press.isEcho()).toBe(false);
    press.touchStart([finger()]);
    press.touchEnd();
    wait(1_500);
    expect(press.isEcho()).toBe(false);
  });
});
