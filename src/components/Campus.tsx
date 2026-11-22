"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import BuildingBar from "@/components/indoor/BuildingBar";
import BuildingPanel from "@/components/indoor/BuildingPanel";
import ConfirmedCard from "@/components/indoor/ConfirmedCard";
import FloorSwitcher from "@/components/indoor/FloorSwitcher";
import RoomCard from "@/components/indoor/RoomCard";
import MapOverlays from "@/components/map/MapOverlays";
import MapSurface, { type MapHandle, type MapProblem } from "@/components/map/MapSurface";
import NavigationCard from "@/components/nav/NavigationCard";
import SelectionCard from "@/components/nav/SelectionCard";
import SuggestionCard from "@/components/nav/SuggestionCard";
import BrowseNotice from "@/components/screens/BrowseNotice";
import { FindingScreen, LockedScreen, PermissionScreen, ProblemScreen } from "@/components/screens/LocationScreens";
import Announcer from "@/components/ui/Announcer";
import Badge from "@/components/ui/Badge";
import BottomSheet, { type SheetSize } from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";
import MapControls from "@/components/ui/MapControls";
import MockPanel from "@/components/ui/MockPanel";
import OnlineMapPrompt from "@/components/ui/OnlineMapPrompt";
import PlaceEditor from "@/components/ui/PlaceEditor";
import QualityBadge from "@/components/ui/QualityBadge";
import SearchBox from "@/components/ui/SearchBox";
import { useColourScheme } from "@/hooks/useColourScheme";
import { useAppState, useController } from "@/hooks/useController";
import { useOnlineMap } from "@/hooks/useOnlineMap";
import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import { config, isEditorRequested } from "@/lib/config";
import { boundsOf } from "@/lib/geo/area";
import type { LngLat } from "@/lib/geo/types";
import type { MockLocationProvider } from "@/lib/location/mockProvider";
import { providerName } from "@/lib/map/basemap";
import type { SearchItem } from "@/lib/search/search";
import { capabilitiesOf } from "@/lib/state/capabilities";
import { destinationInfo } from "@/lib/state/destination";
import type { AppState, Destination } from "@/lib/state/types";

type Screen = "browse" | "permission" | "problem" | "finding" | "locked" | "campus";

/** Which screen this is. Everything else follows from it. */
function screenOf({ presence, provider }: AppState): Exclude<Screen, "browse"> {
  if (provider.status === "idle") return "permission";
  // These end the measuring, so there is nothing to show.
  if (provider.status === "failed" && /denied|insecure|unsupported/.test(provider.problem)) return "problem";
  if (presence.status === "inside") return "campus";
  // With a known position the locked screen is more useful than a passing problem.
  if (presence.status === "outside") return "locked";
  return provider.status === "failed" ? "problem" : "finding";
}

interface CampusProps {
  gps: MockLocationProvider | null;
  linked?: Destination;
}

export default function Campus({ gps, linked }: CampusProps) {
  const controller = useController();
  const { dataset, dispatch } = controller;
  const editing = isEditorRequested(config, useSearchParams());
  const theme = useColourScheme();
  const online = useOnlineMap();

  const capabilities = capabilitiesOf(dataset, controller.provider.source);
  const located = useAppState(screenOf);
  const screen: Screen = capabilities.presence ? located : "browse";
  const problem = useAppState(({ provider }) => (provider.status === "failed" ? provider.problem : null));
  const hasDestination = useAppState((state) => state.destination !== null);
  const hasSuggestion = useAppState((state) => state.suggestion !== null);
  const indoors = useAppState((state) => state.view !== null);
  const isConfirmed = useAppState((state) => state.confirmed !== null);
  const goalRoomId = useAppState(({ destination }) => (destination?.kind === "room" ? destination.id : null));

  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [mapProblem, setMapProblem] = useState<MapProblem | null>(null);
  const [following, setFollowing] = useState(true);
  // Where the map may only be looked at, a shared room opens right away.
  const [selection, setSelection] = useState<Destination | null>(capabilities.presence ? null : (linked ?? null));
  const [size, setSize] = useState<SheetSize>("peek");
  const [sheetHeight, setSheetHeight] = useState(0);
  const [teleporting, setTeleporting] = useState(false);
  const [clicked, setClicked] = useState<LngLat | null>(null);

  const room = selection?.kind === "room" ? dataset.rooms.find(({ id }) => id === selection.id) : undefined;
  const isOpen = screen === "campus" || screen === "browse";
  const canGo = screen === "campus" && capabilities.guidance;

  // Going into a building or out of it: the map matters most.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follows a change outside React
    setSize("peek");
  }, [indoors]);

  useDemoHook(handle);
  useEditorClicks(handle, editing, setClicked);

  /** Shows a place, or the way from the user to it. */
  const lookAt = useCallback(
    (position: LngLat, from: LngLat | null) => {
      if (!handle) return;
      setFollowing(false);
      const animate = !prefersReducedMotion();
      if (from) {
        const [west, south, east, north] = boundsOf([position, from]);
        handle.map.fitBounds([west, south, east, north], {
          padding: { top: 150, bottom: sheetHeight + 60, left: 60, right: 80 },
          maxZoom: 18,
          animate,
        });
      } else {
        handle.map.easeTo({ center: position, zoom: Math.max(handle.map.getZoom(), 17.5), animate });
      }
    },
    [handle, sheetHeight],
  );

  const exitBuilding = () => {
    dispatch({ type: "view/closed" });
    if (screen === "campus") setFollowing(true);
  };

  const setDestination = (destination: Destination) => {
    setSelection(null);
    dispatch({ type: "destination/set", destination });
  };

  const choose = ({ destination }: SearchItem) => {
    const info = destinationInfo(dataset, destination);
    if (!info) return;
    dispatch({ type: "view/closed" });
    lookAt(info.position, canGo ? (controller.getState().fix?.position ?? null) : null);
    if (canGo) setDestination(destination);
    else setSelection(destination);
  };

  return (
    <div
      className="absolute inset-0"
      style={{ "--sheet-height": `${sheetHeight}px`, "--top-height": indoors ? "8rem" : "4.5rem" } as React.CSSProperties}
    >
      {mapProblem !== "no-webgl" && (
        <MapSurface
          dataset={dataset}
          theme={theme}
          online={online.allowed === true}
          indoors={indoors && isOpen}
          interactive={isOpen}
          onHandle={setHandle}
          onProblem={setMapProblem}
        />
      )}
      {handle && (
        <MapOverlays
          handle={handle}
          gestures={gps && teleporting ? "teleport" : !isOpen ? "none" : canGo ? "navigate" : "browse"}
          indoors={indoors}
          chosenRoomId={room?.id ?? goalRoomId}
          sheetHeight={sheetHeight}
          following={following && !indoors}
          onMoved={() => setFollowing(false)}
          onPin={(position) => setDestination({ kind: "pin", position })}
          onPick={setSelection}
          onTeleport={(position) => gps?.teleport(position)}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 px-3 pt-[calc(var(--safe-top)+0.75rem)]">
        {isOpen && <SearchBox dataset={dataset} onSelect={choose} />}
        {isOpen && <BuildingBar onExit={exitBuilding} />}
        <div className="flex flex-wrap justify-center gap-2">
          {dataset.mode === "demo" && <Badge testId="demo-badge">Demo data: not the real campus</Badge>}
          {screen === "campus" && <QualityBadge />}
        </div>
        {gps && <MockPanel gps={gps} teleporting={teleporting} onTeleporting={setTeleporting} />}
      </div>

      {!isOpen && (
        // The map behind is only a preview.
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 pt-32 pb-28" data-testid="preview-cover">
          {screen === "permission" && <PermissionScreen />}
          {screen === "problem" && problem && <ProblemScreen problem={problem} />}
          {screen === "finding" && <FindingScreen />}
          {screen === "locked" && <LockedScreen />}
        </div>
      )}

      {mapProblem === "no-webgl" && isOpen && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div role="alert" data-testid="no-webgl" className="max-w-sm rounded-2xl bg-surface p-5 text-sm text-ink shadow-xl">
            <p className="font-bold">This device can&apos;t draw the map</p>
            <p className="mt-1 text-ink-muted">
              It needs WebGL, which is switched off or missing here. Search, distances and directions still work.
            </p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2">
        {isOpen && indoors && (
          <div className="flex w-full max-w-xl justify-end px-3">
            <FloorSwitcher />
          </div>
        )}
        {screen === "campus" && !indoors && mapProblem !== "no-webgl" && (
          <div className="flex w-full max-w-xl justify-end px-3">
            <MapControls
              following={following}
              onFollow={() => setFollowing(true)}
              onPinCentre={() => {
                const centre = handle?.map.getCenter();
                if (centre && canGo) setDestination({ kind: "pin", position: [centre.lng, centre.lat] });
              }}
            />
          </div>
        )}
        {mapProblem === "context-lost" && <Notice>The graphics were reset. The map is coming back…</Notice>}
        {mapProblem === "online-failed" && (
          <Notice>
            The street map could not be loaded. The campus map still works.{" "}
            <Button look="quiet" onClick={() => setMapProblem(null)}>
              OK
            </Button>
          </Notice>
        )}
        {screen === "campus" && (problem === "timeout" || problem === "unavailable") && (
          <Notice>The GPS has a problem right now. Your last position may be old.</Notice>
        )}
        {online.allowed === null && (
          <OnlineMapPrompt
            provider={providerName(config)}
            onAccept={() => online.decide(true)}
            onDecline={() => online.decide(false)}
          />
        )}
        {editing && <PlaceEditor position={clicked} />}

        <BottomSheet
          size={size}
          onResize={setSize}
          resizable={isOpen && !selection && (indoors || (hasDestination && screen === "campus" && !hasSuggestion))}
          onHeight={setSheetHeight}
        >
          {isOpen && room ? (
            <RoomCard room={room} onCampus={screen === "campus"} canGo={canGo} onClose={() => setSelection(null)} />
          ) : isOpen && selection ? (
            <SelectionCard selection={selection} canGo={canGo} onClose={() => setSelection(null)} />
          ) : (
            <>
              {screen === "browse" && !indoors && <BrowseNotice reasons={capabilities.reasons} />}
              {screen === "campus" && (
                <>
                  <SuggestionCard />
                  {isConfirmed && !indoors && (
                    <div className="px-4 pt-4">
                      <ConfirmedCard />
                    </div>
                  )}
                  {hasDestination ? (
                    <NavigationCard expanded={size !== "peek"} />
                  ) : (
                    !indoors && <Hint canGo={canGo} />
                  )}
                </>
              )}
              {isOpen && indoors && <BuildingPanel onCampus={screen === "campus"} onPick={setSelection} />}
              {screen === "campus" && !indoors && <StopButton />}
            </>
          )}
        </BottomSheet>
      </div>

      <Announcer />
    </div>
  );
}

function Hint({ canGo }: { canGo: boolean }) {
  return (
    <p className="px-4 pt-4 pb-2 text-sm text-ink-muted" data-testid="hint">
      {canGo
        ? "Search for a place, or press and hold the map to drop a pin. With a mouse, click."
        : "Navigation is not available yet, because the walking paths have not been reviewed."}
    </p>
  );
}

function StopButton() {
  const { disableLocation } = useController();

  return (
    <div className="pb-2">
      <Button look="quiet" onClick={disableLocation}>
        Stop using my location
      </Button>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="pointer-events-auto mx-3 rounded-xl bg-warn-surface px-4 py-2 text-sm text-warn shadow">
      {children}
    </p>
  );
}

/** Lets the browser tests of demo builds look at the map. Not in a normal build. */
function useDemoHook(handle: MapHandle | null): void {
  useEffect(() => {
    if (!config.demoEnabled || !handle) return;
    const target = window as unknown as { __jecMaps?: unknown };
    target.__jecMaps = {
      project: (position: LngLat) => {
        const { x, y } = handle.map.project(position);
        return { x, y };
      },
      centre: () => handle.map.getCenter().toArray(),
    };
    return () => {
      delete target.__jecMaps;
    };
  }, [handle]);
}

function useEditorClicks(handle: MapHandle | null, editing: boolean, onClick: (position: LngLat) => void): void {
  useEffect(() => {
    if (!handle || !editing) return;
    const click = handle.map.on("click", ({ lngLat }) => onClick([lngLat.lng, lngLat.lat]));
    return () => click.unsubscribe();
  }, [handle, editing, onClick]);
}
