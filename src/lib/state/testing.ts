/** A small simulator for tests: a clock, a phone, and the state machine. */
import { published } from "../data/testing";
import type { PublishedDataset } from "../data/published";
import { localPlane } from "../geo/localPlane";
import { JEC_CENTRE, type LngLat } from "../geo/types";
import type { Fix, LocationSource } from "../location/types";
import { buildGraph } from "../routing/graph";
import { findRoute } from "../routing/route";
import { capabilitiesOf } from "./capabilities";
import { routeTarget } from "./destination";
import { initialState, reduce } from "./reducer";
import type { AppEvent, AppState, World } from "./types";

const plane = localPlane(JEC_CENTRE);

/** Metres east and north of the campus centre. */
export const at = (x: number, y: number): LngLat => plane.toLngLat([x, y]);
export const xyOf = (point: LngLat): [number, number] => plane.toXY(point);

/** Spots of the demo campus: see scripts/lib/demoCampus.ts. */
export const SPOT = {
  insideByGate: at(0, -150),
  middle: at(0, -50),
  justOutside: at(0, -200),
  farOutside: at(0, -400),
  blockADoor: at(-80, 18),
  betweenBlocks: at(88, 40),
} as const;

export class Simulator {
  state: AppState = initialState;
  now = 1_000_000;
  readonly world: World;
  private readonly graph;

  constructor(dataset: PublishedDataset = published().core, source: LocationSource = "mock") {
    this.world = { dataset, capabilities: (which) => capabilitiesOf(dataset, which) };
    this.graph = buildGraph(dataset);
    this.send({ type: "provider/started", source });
  }

  send(event: AppEvent): this {
    this.state = reduce(this.state, event, this.now, this.world);
    return this;
  }

  /** Answers the open question, the way the app does. */
  solve(): this {
    const { navigation, destination, fix } = this.state;
    if (navigation.status !== "computing" || !destination || !fix) return this;
    const target = routeTarget(this.world.dataset, destination);
    if (!target) return this;
    const result = findRoute(
      this.graph,
      this.world.dataset.buildings.map((building) => building.geometry),
      { origin: fix.position, target, avoidSteps: this.state.avoidStairs },
    );
    return this.send({ type: "route/computed", requestId: navigation.requestId, result });
  }

  wait(ms: number): this {
    this.now += ms;
    return this.send({ type: "tick" });
  }

  /** A fix, measured right now unless said otherwise. */
  fix(position: LngLat, overrides: Partial<Fix> = {}): this {
    return this.send({
      type: "provider/event",
      event: {
        type: "fix",
        fix: {
          position,
          accuracyM: 8,
          timestamp: this.now,
          speedMps: null,
          headingDeg: null,
          source: this.state.source ?? "mock",
          ...overrides,
        },
      },
    });
  }

  /** Several fixes, one second apart. */
  fixes(count: number, position: LngLat, overrides: Partial<Fix> = {}): this {
    for (let i = 0; i < count; i++) {
      this.now += 1_000;
      this.fix(position, overrides);
    }
    return this;
  }

  /** Walks in a straight line at 1.4 m/s, with one fix per second. */
  walk(from: LngLat, to: LngLat, overrides: Partial<Fix> = {}): this {
    const [x1, y1] = xyOf(from);
    const [x2, y2] = xyOf(to);
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 1.4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.fixes(1, at(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t), overrides);
      this.solve();
    }
    return this;
  }

  /** On campus, unlocked. */
  unlock(position: LngLat = SPOT.middle): this {
    return this.fixes(3, position);
  }

  get presence() {
    return this.state.presence.status;
  }
  get nav() {
    return this.state.navigation;
  }
}
