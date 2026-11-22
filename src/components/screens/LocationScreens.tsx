"use client";

import RoomFacts from "@/components/indoor/RoomFacts";
import Button from "@/components/ui/Button";
import { useAppState, useController } from "@/hooks/useController";
import { formatDistance } from "@/lib/format";
import type { ProviderProblem } from "@/lib/location/types";
import { destinationInfo } from "@/lib/state/destination";

import MessageCard from "./MessageCard";

/** Nothing is measured before this button is pressed. */
export function PermissionScreen() {
  const { enableLocation } = useController();

  return (
    <MessageCard
      testId="permission-screen"
      title="Find your way around campus"
      actions={<Button onClick={enableLocation}>Enable location</Button>}
    >
      <p>The map unlocks when you are on campus. For that it needs your location.</p>
      <p>
        <strong className="text-ink">It stays on this device.</strong> Nothing about where you are is sent anywhere. Your
        browser will ask you next.
      </p>
      <SavedDestination />
    </MessageCard>
  );
}

const PROBLEMS: Record<ProviderProblem, { title: string; text: string[]; retry: boolean }> = {
  denied: {
    title: "Location is blocked",
    text: [
      "Allow it in the settings of this site: press the icon next to the address, choose Location, then Allow.",
      "On a phone, location must also be on for your browser. Help explains where.",
    ],
    retry: true,
  },
  insecure: {
    title: "This address is not secure",
    text: ["Browsers only share the location with pages whose address starts with https. Open the https address."],
    retry: false,
  },
  unsupported: {
    title: "This browser has no location",
    text: ["Try a current version of Chrome, Firefox, Edge or Safari."],
    retry: false,
  },
  unavailable: {
    title: "Your position can't be found",
    text: ["Switch on location on your device, and step outside or to a window."],
    retry: true,
  },
  timeout: {
    title: "This is taking long",
    text: ["The GPS is still searching. Step outside, away from walls, and wait a moment."],
    retry: true,
  },
};

export function ProblemScreen({ problem }: { problem: ProviderProblem }) {
  const { enableLocation } = useController();
  const { title, text, retry } = PROBLEMS[problem];

  return (
    <MessageCard
      role="alert"
      testId={`problem-${problem}`}
      title={title}
      actions={retry && <Button onClick={enableLocation}>Try again</Button>}
    >
      {text.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </MessageCard>
  );
}

/** Waiting for a position that can be used. */
export function FindingScreen() {
  const { disableLocation } = useController();
  const level = useAppState((state) => state.quality.level);
  const accuracy = useAppState((state) => Math.round(state.quality.accuracyM ?? 0));

  return (
    <MessageCard
      role="status"
      testId="finding-screen"
      title="Looking for you…"
      actions={
        <Button look="secondary" onClick={disableLocation}>
          Stop
        </Button>
      }
    >
      {level === "poor" ? (
        <p>
          The signal is too rough right now (±{accuracy} m). Step outside, away from walls, and make sure your browser may
          use the precise location.
        </p>
      ) : (
        <p>This takes a few seconds. It is faster outside.</p>
      )}
    </MessageCard>
  );
}

/** Off campus: the map can be seen, but not used. */
export function LockedScreen() {
  const { dataset, disableLocation } = useController();
  const isFresh = useAppState((state) => state.quality.level !== "stale" && state.quality.level !== "none");
  const distance = useAppState((state) => (state.presence.status === "outside" ? formatDistance(state.presence.distanceM) : null));

  return (
    <MessageCard
      testId="locked-screen"
      title="The map unlocks on campus"
      actions={
        <Button look="secondary" onClick={disableLocation}>
          Stop using my location
        </Button>
      }
    >
      <p role="status">
        {isFresh && distance ? (
          <>
            You&apos;re about <strong className="text-ink">{distance}</strong> from {dataset.title}.
          </>
        ) : (
          "Your location is unavailable right now, so the distance is unknown."
        )}
      </p>
      <SavedDestination />
    </MessageCard>
  );
}

/** A destination can be kept off campus, for example from a room link. */
function SavedDestination() {
  const { dataset, dispatch } = useController();
  const destination = useAppState((state) => state.destination);
  const info = destination && destinationInfo(dataset, destination);
  if (!info) return null;

  return (
    <div className="rounded-xl bg-surface-2 p-3" data-testid="saved-destination">
      <p>
        Your destination: <strong className="text-ink">{info.name}</strong>
        {info.detail && !info.room && <span className="block">{info.detail}</span>}
      </p>
      {info.room && (
        <div className="mt-2" data-testid="shared-room">
          <RoomFacts dataset={dataset} room={info.room} />
        </div>
      )}
      <Button look="quiet" onClick={() => dispatch({ type: "destination/cleared" })}>
        Remove it
      </Button>
    </div>
  );
}
