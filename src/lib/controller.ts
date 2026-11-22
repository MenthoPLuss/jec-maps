/**
 * Connects the state machine to the world: the GPS, the clock and the route search.
 *
 * It lives outside React, so a new position doesn't redraw the whole app. Parts of
 * the screen subscribe to what they need.
 */
import type { AreaGeometry } from "./geo/area";
import type { PublishedDataset } from "./data/published";
import type { LocationProvider } from "./location/types";
import { buildGraph, type Graph } from "./routing/graph";
import { findRoute } from "./routing/route";
import { capabilitiesOf } from "./state/capabilities";
import { isDestination, routeTarget } from "./state/destination";
import { initialState, reduce } from "./state/reducer";
import type { AppEvent, AppState, Destination, World } from "./state/types";
import { isBoolean, storedValue, type KeyValueStore, type StoredValue } from "./storage";

const TICK_MS = 1_000;

export interface ControllerOptions {
  dataset: PublishedDataset;
  provider: LocationProvider;
  now?: () => number;
  /** Runs something a little later. Tests run it at once. */
  defer?: (task: () => void) => void;
  store?: () => KeyValueStore | null;
}

export class CampusController {
  readonly dataset: PublishedDataset;
  readonly provider: LocationProvider;

  private state: AppState = initialState;
  private readonly listeners = new Set<() => void>();
  private readonly world: World;
  private readonly graph: Graph;
  private readonly obstacles: AreaGeometry[];
  private readonly now: () => number;
  private readonly defer: (task: () => void) => void;
  private readonly savedDestination: StoredValue<Destination>;
  private readonly savedAvoidStairs: StoredValue<boolean>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  private solving = 0;

  constructor(options: ControllerOptions) {
    this.dataset = options.dataset;
    this.provider = options.provider;
    this.now = options.now ?? Date.now;
    this.defer = options.defer ?? ((task) => setTimeout(task, 0));
    this.world = {
      dataset: options.dataset,
      capabilities: (source) => capabilitiesOf(options.dataset, source),
    };
    this.graph = buildGraph(options.dataset);
    this.obstacles = options.dataset.buildings.map((building) => building.geometry);
    this.savedDestination = storedValue("destination", 1, isDestination, options.store);
    this.savedAvoidStairs = storedValue("avoid-stairs", 1, isBoolean, options.store);
  }

  // --- For the screen ---

  getState = (): AppState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (event: AppEvent): void => {
    const before = this.state;
    const after = reduce(before, event, this.now(), this.world);
    if (after === before) return;

    this.state = after;
    this.remember(before, after);
    for (const listener of [...this.listeners]) listener();
    this.solveIfAsked();
  };

  // --- Life ---

  /** Begins to listen. Does not touch the GPS: that needs `enableLocation`. */
  connect(): void {
    this.unsubscribe ??= this.provider.subscribe((event) => this.dispatch({ type: "provider/event", event }));
    this.timer ??= setInterval(() => this.dispatch({ type: "tick" }), TICK_MS);
  }

  disconnect(): void {
    this.provider.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Only ever called because the user pressed a button, or started the fake GPS. */
  enableLocation = (): void => {
    this.dispatch({ type: "provider/started", source: this.provider.source });
    this.provider.start();
  };

  disableLocation = (): void => {
    this.provider.stop();
    this.dispatch({ type: "provider/stopped" });
  };

  /** The destination and the choices of the last visit. Never a position or a room. */
  restore(): void {
    if (this.savedAvoidStairs.read() === true) this.dispatch({ type: "settings/avoidStairs", value: true });
    const destination = this.savedDestination.read();
    if (destination) this.dispatch({ type: "destination/set", destination });
  }

  // --- Inside ---

  private solveIfAsked(): void {
    const { navigation } = this.state;
    if (navigation.status !== "computing" || navigation.requestId === this.solving) return;

    const { requestId } = navigation;
    this.solving = requestId;
    this.defer(() => {
      const { destination, fix, avoidStairs, navigation: current } = this.state;
      // Something else was asked meanwhile.
      if (current.status !== "computing" || current.requestId !== requestId || !destination || !fix) return;
      const target = routeTarget(this.dataset, destination);
      if (!target) return this.dispatch({ type: "destination/cleared" });

      const result = findRoute(this.graph, this.obstacles, { origin: fix.position, target, avoidSteps: avoidStairs });
      this.dispatch({ type: "route/computed", requestId, result });
    });
  }

  private remember(before: AppState, after: AppState): void {
    if (before.destination !== after.destination) {
      if (after.destination) this.savedDestination.write(after.destination);
      else this.savedDestination.clear();
    }
    if (before.avoidStairs !== after.avoidStairs) this.savedAvoidStairs.write(after.avoidStairs);
  }
}
