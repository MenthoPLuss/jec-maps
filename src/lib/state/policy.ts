/**
 * Every threshold of the app, in one place. Metres, seconds written as milliseconds.
 *
 * These gate the user interface. They are no proof of where anyone is, and no
 * security: whoever can run JavaScript can change them.
 */
export const POLICY = {
  fix: {
    /** Older fixes never change anything. */
    staleAfterMs: 15_000,
    /** A clock may be a little ahead, but not by more than this. */
    futureToleranceMs: 5_000,
    goodM: 20,
    fairM: 50,
    /** Worse fixes are shown as "too rough" and ignored. */
    ignoreWorseThanM: 100,
  },

  presence: {
    unlock: { maxAccuracyM: 50, fixes: 2, minSpanMs: 1_000 },
    exit: { maxAccuracyM: 50, bufferM: 25, fixes: 2, minSpanMs: 5_000 },
  },

  building: {
    /** When to ask "Are you in this building?". */
    suggest: { maxAccuracyM: 25, fixes: 2, minSpanMs: 1_000, footprintM: 5, entranceM: 12 },
    /** GPS that goes quiet at a door. */
    lost: { afterMs: 10_000, maxAccuracyM: 25, entranceM: 15 },
    /** When to stop asking. */
    withdraw: { maxAccuracyM: 25, awayM: 25, fixes: 2, minSpanMs: 1_000 },
    dismissForMs: 120_000,
    /** When reliable fixes outside end "I'm in this building". */
    clear: { maxAccuracyM: 20, awayM: 10, fixes: 3, minSpanMs: 8_000 },
    /** After this long in the background a confirmed room has to be confirmed again. */
    reconfirmAfterMs: 120_000,
  },

  route: {
    /** Further from a path than this, no walk is offered. */
    snapM: 20,
    /** Paths whose distance differs by less than this are equally near. */
    sameSpotM: 2,
    /** One unverified metre counts as this many. */
    approachPenalty: 3,
    offRoute: { minM: 20, fixes: 3, minSpanMs: 4_000 },
    minRerouteMs: 1_000,
    /** How far ahead and behind the last progress a walker can be on the route. */
    window: { behindM: 20, aheadM: 80 },
  },

  arrival: {
    maxAccuracyM: 20,
    radiusM: 20,
    /** How much of the route may be left. */
    maxRemainingM: 30,
    fixes: 2,
    minSpanMs: 3_000,
    /** Close enough to say "near", whatever the accuracy. */
    nearM: 35,
  },

  speed: {
    defaultMps: 1.35,
    indoorMps: 1.1,
    minMps: 0.8,
    maxMps: 2.0,
    /** Weight of a new measurement. */
    alpha: 0.15,
    maxAccuracyM: 20,
    /** Slower is standing, faster is no walk (a teleport, a bike, an error). */
    plausible: { minMps: 0.4, maxMps: 3 },
    pausedAfterMs: 10_000,
  },

  indoor: {
    stairsPerFloorS: 15,
    liftWaitS: 30,
    liftPerFloorS: 5,
  },

  /** A bigger jump is not animated. */
  animation: { durationMs: 500, maxJumpM: 60 },
  announceEveryMs: 10_000,
} as const;
