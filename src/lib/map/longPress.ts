/** Tells a long press from a tap, a drag and a pinch. Knows nothing about maps. */

export interface LongPressOptions {
  holdMs?: number;
  /** Moving further than this is a drag. */
  moveTolerancePx?: number;
  /** A click right after a touch is its echo, not a second action. */
  echoMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export class LongPress {
  private timer: unknown = null;
  private start: ScreenPoint | null = null;
  private lastTouchAt = -Infinity;
  private readonly options: Required<LongPressOptions>;

  constructor(
    private readonly onLongPress: (point: ScreenPoint) => void,
    options: LongPressOptions = {},
  ) {
    this.options = {
      holdMs: 550,
      moveTolerancePx: 10,
      echoMs: 1_000,
      now: () => performance.now(),
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  touchStart(points: ScreenPoint[]): void {
    this.lastTouchAt = this.options.now();
    this.cancel();
    if (points.length !== 1) return; // a second finger: a pinch
    this.start = points[0];
    this.timer = this.options.setTimer(() => {
      const point = this.start;
      this.cancel();
      this.lastTouchAt = this.options.now();
      if (point) this.onLongPress(point);
    }, this.options.holdMs);
  }

  touchMove(points: ScreenPoint[]): void {
    if (!this.start) return;
    const [point] = points;
    const moved = points.length !== 1 || Math.hypot(point.x - this.start.x, point.y - this.start.y) > this.options.moveTolerancePx;
    if (moved) this.cancel();
  }

  touchEnd(): void {
    this.lastTouchAt = this.options.now();
    this.cancel();
  }

  /** The map started to move or zoom, or the component goes away. */
  cancel(): void {
    if (this.timer !== null) this.options.clearTimer(this.timer);
    this.timer = null;
    this.start = null;
  }

  /** True when a click belongs to a touch that was already handled. */
  isEcho(): boolean {
    return this.options.now() - this.lastTouchAt < this.options.echoMs;
  }
}
