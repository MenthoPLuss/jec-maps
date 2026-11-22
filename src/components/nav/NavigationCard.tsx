"use client";

import StepList from "@/components/indoor/StepList";
import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { formatBearing, formatDistance, formatDuration } from "@/lib/format";
import { bearingDeg } from "@/lib/geo/distance";
import { destinationInfo, type DestinationInfo } from "@/lib/state/destination";
import { knowsPlace } from "@/lib/state/navigation";
import { isPaused, walkingSeconds } from "@/lib/state/speed";
import type { AppState, Navigation, WaitingReason } from "@/lib/state/types";
import type { NoRouteReason } from "@/lib/routing/route";

const WAITING: Record<WaitingReason, string> = {
  "no-position": "Waiting for a usable position…",
  outside: "The route starts when you are on campus.",
  "not-allowed": "Navigation is not available with this data.",
};

const NO_ROUTE: Record<NoRouteReason, string> = {
  "no-network": "There are no checked paths here yet.",
  "origin-off-network": "You are too far from the nearest checked path.",
  "target-off-network": "The destination is too far from any checked path.",
  "no-entrance": "No open door of this building is known.",
  "not-connected": "No checked path leads there.",
  "only-steps": "No step-free route is known. Every known way has stairs.",
};

/** Where you are going, how far it is, and what you can do about it. */
export default function NavigationCard({ expanded }: { expanded: boolean }) {
  const { dataset, dispatch } = useController();
  const destination = useAppState((state) => state.destination);
  const navigation = useAppState((state) => state.navigation);
  const avoidStairs = useAppState((state) => state.avoidStairs);
  const isInside = useAppState(knowsPlace);
  const info = destination && destinationInfo(dataset, destination);
  if (!info) return null;

  const canCancel = navigation.status === "active" || navigation.status === "no-route";
  const canRestart = navigation.status === "cancelled" || navigation.status === "arrived";

  return (
    <section aria-label="Destination" data-testid="navigation" data-status={navigation.status} className="space-y-3 p-4">
      <header>
        <h2 className="text-base font-bold">{info.name}</h2>
        {info.detail && <p className="text-sm text-ink-muted">{info.detail}</p>}
      </header>

      <Status info={info} navigation={navigation} />
      {navigation.status === "active" && (expanded || navigation.proximity === "entrance" || isInside) && (
        <StepList route={navigation.route} room={info.room} />
      )}

      {(expanded || canRestart) && (
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <Button look="secondary" onClick={() => dispatch({ type: "route/cancelled" })}>
              Cancel route
            </Button>
          )}
          {canRestart && <Button onClick={() => dispatch({ type: "route/restarted" })}>Restart route</Button>}
          <Button look="secondary" onClick={() => dispatch({ type: "destination/cleared" })}>
            Clear destination
          </Button>
        </div>
      )}
      {expanded && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={avoidStairs}
            onChange={(event) => dispatch({ type: "settings/avoidStairs", value: event.target.checked })}
            className="size-5"
          />
          <span>
            Avoid stairs
            <span className="block text-xs text-ink-muted">Not a promise that a wheelchair gets through</span>
          </span>
        </label>
      )}
    </section>
  );
}

function Status({ info, navigation }: { info: DestinationInfo; navigation: Navigation }) {
  const { dispatch } = useController();
  const isInside = useAppState(knowsPlace);
  const showInside = (room: DestinationInfo["room"], level: number | undefined) => {
    if (room) dispatch({ type: "view/opened", buildingId: room.buildingId, level });
  };

  switch (navigation.status) {
    case "idle":
      return null;

    case "waiting":
      return <p className="text-sm text-ink-muted">{WAITING[navigation.reason]}</p>;

    case "computing":
      return <p className="text-sm text-ink-muted">Finding a route…</p>;

    case "cancelled":
      return <p className="text-sm text-ink-muted">Route cancelled.</p>;

    case "arrived":
      return (
        <p data-testid="arrived" className="text-lg font-bold text-good">
          {info.room ? "You've reached the room" : info.buildingId ? "You've arrived at the building" : "You've arrived"}
        </p>
      );

    case "no-route":
      return (
        <div className="space-y-2 text-sm">
          <p>
            <strong>Route unavailable.</strong> {NO_ROUTE[navigation.reason]}
          </p>
          <p data-testid="straight-line" className="text-ink-muted">
            {formatDistance(navigation.straightLineM)} in a straight line{" "}
            <Towards info={info} />. This is not a walking route.
          </p>
          {navigation.near && <Near />}
        </div>
      );

    case "active":
      return (
        <div className="space-y-2">
          {isInside ? (
            <div className="space-y-2">
              <p data-testid="inside" className="text-sm">
                Inside: {formatDuration(insideSeconds(navigation))}. An estimate. Move the steps on yourself.
              </p>
              {info.room && (
                <Button look="secondary" onClick={() => dispatch({ type: "room/confirmed", roomId: info.room?.id ?? "" })}>
                  I&apos;ve reached the room
                </Button>
              )}
            </div>
          ) : (
            <Remaining info={info} />
          )}
          {navigation.proximity === "entrance" && !isInside ? (
            <div data-testid="at-entrance" className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
              <p>
                <strong>You&apos;re at the entrance.</strong> {info.name} is on: {info.detail}.
                {info.room?.near && ` Hint: ${info.room.near}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {info.room && (
                  <Button look="secondary" onClick={() => showInside(info.room, navigation.route.enter?.pieces[0]?.level)}>
                    Show the way inside
                  </Button>
                )}
                <Button onClick={() => dispatch({ type: "arrival/confirmed" })}>I&apos;ve reached the room</Button>
              </div>
            </div>
          ) : (
            // Near a building is not near a room in it.
            navigation.proximity === "near" && !info.room && !isInside && <Near />
          )}
          <Notes navigation={navigation} />
        </div>
      );
  }
}

/** The big numbers. The text only changes when the rounded number does. */
function Remaining({ info }: { info: DestinationInfo }) {
  const distance = useAppState((state) => formatDistance(remainingM(state)));
  const duration = useAppState((state) =>
    formatDuration(
      walkingSeconds(remainingM(state), state.speed) +
        (state.navigation.status === "active" ? insideSeconds(state.navigation) : 0),
    ),
  );
  const paused = useAppState((state) => state.fix !== null && isPaused(state.speed, state.fix.timestamp));
  const stale = useAppState((state) => state.quality.level === "stale");

  return (
    <p className="flex flex-wrap items-baseline gap-x-3">
      <span data-testid="distance" className="text-2xl font-bold">
        {distance}
      </span>
      <span data-testid="eta" className="text-lg">
        {duration}
      </span>
      <span className="text-sm text-ink-muted">
        <Towards info={info} />
      </span>
      {stale ? (
        <span className="text-sm font-semibold text-warn">Position lost</span>
      ) : (
        paused && <span className="text-sm text-ink-muted">Paused</span>
      )}
    </p>
  );
}

/** An arrow and words: the direction, with north at the top. */
function Towards({ info }: { info: DestinationInfo }) {
  const bearing = useAppState((state) =>
    state.fix ? Math.round(bearingDeg(state.fix.position, targetOf(state, info)) / 5) * 5 : null,
  );
  if (bearing === null) return null;

  return (
    <span className="whitespace-nowrap">
      <span aria-hidden className="inline-block" style={{ transform: `rotate(${bearing}deg)` }}>
        ↑
      </span>{" "}
      {formatBearing(bearing)}
    </span>
  );
}

function Near() {
  const { dispatch } = useController();

  return (
    <div data-testid="near" className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3 text-sm">
      <span>Near your destination.</span>
      <Button onClick={() => dispatch({ type: "arrival/confirmed" })}>I&apos;m here</Button>
    </div>
  );
}

function Notes({ navigation }: { navigation: Extract<Navigation, { status: "active" }> }) {
  const { route } = navigation;
  const notes = [
    route.unverifiedM >= 5 && `${formatDistance(route.unverifiedM)} of it (dashed) is only a direction: nobody has checked that you can walk there.`,
    route.accessUnknown && "Nobody has checked whether this door is open to everyone.",
    route.legs.some((leg) => leg.steps) && "This route has stairs outside.",
    route.enter?.pieces.some((piece) => piece.kind === "stairs") && "The way inside has stairs.",
    route.indoorNote === "no-plan" && "The way inside is not drawn yet: the route ends at the entrance.",
    route.indoorNote === "only-steps" && "No step-free way to the room is known: the route ends at the entrance.",
  ].filter((note) => typeof note === "string");

  return (
    <>
      {notes.map((note) => (
        <p key={note} className="text-xs text-ink-muted">
          {note}
        </p>
      ))}
    </>
  );
}

function remainingM({ navigation }: AppState): number {
  return navigation.status === "active" ? navigation.progress.remainingM : 0;
}

function insideSeconds({ route }: Extract<Navigation, { status: "active" }>): number {
  return (route.exit?.seconds ?? 0) + (route.enter?.seconds ?? 0);
}

function targetOf({ navigation }: AppState, info: DestinationInfo): [number, number] {
  return navigation.status === "active" ? navigation.route.end : info.position;
}
