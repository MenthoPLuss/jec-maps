"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import DatasetError from "@/components/screens/DatasetError";
import MessageCard from "@/components/screens/MessageCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import InfoBar from "@/components/ui/InfoBar";
import OnlineMapPrompt from "@/components/ui/OnlineMapPrompt";
import PlaceEditor from "@/components/ui/PlaceEditor";
import SearchBox, { type SearchHit } from "@/components/ui/SearchBox";
import { useColourScheme } from "@/hooks/useColourScheme";
import { useDataset } from "@/hooks/useDataset";
import { useOnlineMap } from "@/hooks/useOnlineMap";
import { config, isEditorRequested } from "@/lib/config";
import type { PublishedDataset } from "@/lib/data/published";
import type { LngLat } from "@/lib/geo/types";
import { providerName } from "@/lib/map/basemap";

import type { MapHandle, MapProblem } from "./map/MapSurface";

// The map needs a browser, so it never runs while the page is rendered on the server.
const MapSurface = dynamic(() => import("./map/MapSurface"), { ssr: false });
const SelectionMarker = dynamic(() => import("./map/SelectionMarker"), { ssr: false });

export default function CampusApp() {
  const { state, retry } = useDataset();

  return (
    <main className="app-frame bg-surface-2">
      {state.status === "loading" && <Centred>Loading the campus map…</Centred>}
      {state.status === "failed" && (
        <Centred>
          <DatasetError kind={state.kind} onRetry={retry} />
        </Centred>
      )}
      {state.status === "ready" && <Campus dataset={state.dataset} />}
    </main>
  );
}

function Campus({ dataset }: { dataset: PublishedDataset }) {
  const params = useSearchParams();
  const editing = isEditorRequested(config, params);
  const theme = useColourScheme();
  const online = useOnlineMap();

  const [handle, setHandle] = useState<MapHandle | null>(null);
  const [problem, setProblem] = useState<MapProblem | null>(null);
  const [selected, setSelected] = useState<SearchHit | null>(null);
  const [clicked, setClicked] = useState<LngLat | null>(null);

  useEffect(() => {
    if (!handle || !editing) return;
    const click = handle.map.on("click", ({ lngLat }) => setClicked([lngLat.lng, lngLat.lat]));
    return () => click.unsubscribe();
  }, [handle, editing]);

  return (
    <div className="absolute inset-0 [--sheet-height:3.75rem]">
      {problem !== "no-webgl" && (
        <MapSurface
          dataset={dataset}
          theme={theme}
          online={online.allowed === true}
          interactive
          onHandle={setHandle}
          onProblem={setProblem}
        />
      )}

      {handle && selected && <SelectionMarker handle={handle} position={selected.position} />}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-3 pt-[calc(var(--safe-top)+0.75rem)]">
        <SearchBox dataset={dataset} onSelect={setSelected} />
        {dataset.mode === "demo" && <Badge testId="demo-badge">Demo data: not the real campus</Badge>}
      </div>

      {problem === "no-webgl" && (
        <Centred>
          <MessageCard title="This device can't draw the map" role="alert" testId="no-webgl">
            <p>The map needs WebGL, which is switched off or missing here. The search still works.</p>
          </MessageCard>
        </Centred>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-[var(--safe-bottom)]">
        {problem === "context-lost" && <Notice>The graphics were reset. The map is coming back…</Notice>}
        {problem === "online-failed" && (
          <Notice>
            The street map could not be loaded. The campus map still works.{" "}
            <Button look="quiet" onClick={() => setProblem(null)}>
              OK
            </Button>
          </Notice>
        )}
        {online.allowed === null && (
          <OnlineMapPrompt
            provider={providerName(config)}
            onAccept={() => online.decide(true)}
            onDecline={() => online.decide(false)}
          />
        )}
        {editing && <PlaceEditor position={clicked} />}
        <div className="pointer-events-auto w-full bg-surface">
          <InfoBar />
        </div>
      </div>
    </div>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
      <div className="contents">{children}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="pointer-events-auto mx-3 rounded-xl bg-warn-surface px-4 py-2 text-sm text-warn shadow"
    >
      {children}
    </p>
  );
}
