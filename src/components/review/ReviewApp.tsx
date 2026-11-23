"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import { useColourScheme } from "@/hooks/useColourScheme";
import { loadDataset } from "@/lib/data/client";
import { isTrusted } from "@/lib/data/coverage";
import type { PublishedDataset } from "@/lib/data/published";
import type { PathFeature } from "@/lib/data/schemas";
import { boundsOf } from "@/lib/geo/area";
import { JEC_CENTRE, type LngLat } from "@/lib/geo/types";
import { EMPTY, type FeatureCollection } from "@/lib/map/registry";
import { REVIEW_COLOURS, type ReviewSource } from "@/lib/map/reviewLayers";
import type { ThemeName } from "@/lib/map/theme";
import {
  approvedMatcher,
  isApprovable,
  itemsOf,
  parseCandidates,
  positionsOf,
  type ReviewItem,
} from "@/lib/review/candidates";
import type { PathAccess } from "@/lib/review/commands";
import { doorSpot, isEntranceDraft, junctionsNear, type DoorSpot, type EntranceDraft, type Junction } from "@/lib/review/entrances";
import { previewNetwork } from "@/lib/review/network";
import { storedValue } from "@/lib/storage";
import { DISCLAIMER } from "@/lib/text";

import EntranceTool from "./EntranceTool";
import FileReview, { type OpenFile } from "./FileReview";
import type { Bounds, MapClick } from "./ReviewMap";

// The map needs a browser.
const ReviewMap = dynamic(() => import("./ReviewMap"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-ink-muted">Loading the map…</p>,
});

type View = { kind: "file"; name: string } | { kind: "entrances" };

/** Far more than any campus needs: a bigger file is a mistake. */
const MAX_FILE_BYTES = 30_000_000;
const OSM_CREDIT = "© OpenStreetMap contributors";
/** About 450 m around the middle of the campus, until there is something to show. */
const START_DEG = 0.004;

// Conveniences on this computer only. Without storage the page works the same.
const savedReviewer = storedValue("reviewer", 1, (value): value is string => typeof value === "string" && value.length <= 60);
const savedDrafts = storedValue(
  "review-entrances",
  1,
  (value): value is EntranceDraft[] => Array.isArray(value) && value.every(isEntranceDraft),
);

/** The tool for reviewing candidates and placing entrances. See docs/data-collection.md. */
export default function ReviewApp() {
  const theme = useColourScheme();
  const approved = useApprovedData();
  const live = approved.dataset?.mode === "live" ? approved.dataset : null;

  const [files, setFiles] = useState<OpenFile[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [access, setAccess] = useState<Record<string, PathAccess>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [mapProblem, setMapProblem] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [drafts, setDrafts] = useState<EntranceDraft[]>([]);
  const [door, setDoor] = useState<DoorSpot | null>(null);
  const [missed, setMissed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [frame, setFrame] = useState<{ bounds: Bounds; key: number }>({ bounds: around(JEC_CENTRE), key: 0 });
  const framed = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  // Read after the first render, so the page from the server and in the browser start the same.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage only exists here
    setReviewer(savedReviewer.read() ?? "");
    setDrafts(savedDrafts.read() ?? []);
  }, []);

  const show = (points: LngLat[]) => {
    if (points.length === 0) return;
    framed.current = true;
    setFrame((current) => ({ bounds: boundsOf(points), key: current.key + 1 }));
  };

  // The approved data frames the map until something else is shown.
  const dataset = approved.dataset;
  useEffect(() => {
    if (!dataset || framed.current) return;
    framed.current = true;
    setFrame((current) => ({ bounds: dataset.bounds, key: current.key + 1 }));
  }, [dataset]);

  const active = view?.kind === "file" ? (files.find((file) => file.name === view.name) ?? null) : null;
  const isApproved = useMemo(() => approvedMatcher(live, active?.file.kind ?? "buildings"), [live, active]);
  const chosenSet = useMemo(() => {
    const ids = new Set(chosen[active?.name ?? ""] ?? []);
    return new Set(active?.items.filter((item) => ids.has(item.id) && !item.notApprovable && !isApproved(item)).map((item) => item.id));
  }, [active, chosen, isApproved]);

  const trustedBuildings = useMemo(() => live?.buildings.filter((building) => isTrusted(building.properties)) ?? [], [live]);
  const routable = useMemo(() => {
    const ids = new Set(live?.routablePathIds);
    return live?.paths.filter((path) => ids.has(path.properties.id)) ?? [];
  }, [live]);
  const approvedEntranceIds = useMemo(() => new Set(live?.entrances.map((entrance) => entrance.properties.id)), [live]);

  const preview = useMemo(() => {
    if (active?.file.kind !== "paths") return { lengthM: 0, unconnected: new Set<string>() };
    const paths = active.items.flatMap((item, index) =>
      chosenSet.has(item.id) && item.nodes ? [active.file.records[index] as PathFeature] : [],
    );
    return previewNetwork(routable, paths);
  }, [active, chosenSet, routable]);

  const junctions = useMemo(() => (door ? junctionsNear(routable, door.position) : []), [door, routable]);

  const mapData = useMemo(
    (): Record<ReviewSource, FeatureCollection> => ({
      approved: approvedFeatures(live),
      hints: hintFeatures(files),
      candidates:
        active && isApprovable(active.file.kind)
          ? candidateFeatures(active.items, isApproved, chosenSet, preview.unconnected)
          : EMPTY,
      drafts: view?.kind === "entrances" ? draftFeatures(drafts, door, junctions, picked) : EMPTY,
    }),
    [live, files, active, isApproved, chosenSet, preview, view, drafts, door, junctions, picked],
  );

  const openFiles = async (list: File[]) => {
    const opened: OpenFile[] = [];
    const failed: string[] = [];
    for (const entry of list) {
      if (entry.size > MAX_FILE_BYTES) {
        failed.push(`${entry.name} is too big to be a candidate file.`);
        continue;
      }
      try {
        const file = parseCandidates(await entry.text(), entry.name);
        opened.push({ name: entry.name, file, items: itemsOf(file) });
      } catch (error) {
        failed.push(error instanceof Error ? error.message : `${entry.name} can't be read.`);
      }
    }
    setProblems(failed);
    if (opened.length === 0) return;

    setFiles((current) => [...current.filter((file) => !opened.some((other) => other.name === file.name)), ...opened]);
    setChosen((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !opened.some((file) => file.name === name))));
    openView(opened.find((file) => isApprovable(file.file.kind)) ?? opened[0]);
  };

  const openView = (file: OpenFile) => {
    setView({ kind: "file", name: file.name });
    show(file.items.flatMap((item) => (item.geometry ? positionsOf(item.geometry) : [])));
  };

  const openEntrances = () => {
    setView({ kind: "entrances" });
    if (live) show(boundsCorners(live.bounds));
  };

  const choose = (ids: string[]) => {
    if (active) setChosen((current) => ({ ...current, [active.name]: ids }));
  };

  const onMapClick = ({ id, at }: MapClick) => {
    if (view?.kind === "entrances") {
      const spot = doorSpot(trustedBuildings, at);
      setDoor(spot);
      setMissed(spot === null);
      setPicked(spot ? (junctionsNear(routable, spot.position)[0]?.nodeId ?? null) : null);
      return;
    }
    const item = active?.items.find((entry) => entry.id === id);
    if (!active || !item || item.notApprovable || isApproved(item)) return;
    if (active.file.kind === "boundary") choose(chosenSet.has(item.id) ? [] : [item.id]);
    else choose(chosenSet.has(item.id) ? [...chosenSet].filter((other) => other !== item.id) : [...chosenSet, item.id]);
  };

  const changeDrafts = (next: EntranceDraft[]) => {
    setDrafts(next);
    savedDrafts.write(next);
  };

  return (
    <main
      className="flex h-dvh flex-col-reverse bg-surface text-ink md:flex-row"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        void openFiles([...event.dataTransfer.files]);
      }}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 text-sm md:w-[28rem] md:flex-none">
        <header className="space-y-2">
          <Link href="/" className="inline-block py-2 font-medium text-accent underline underline-offset-2">
            ← Back to the map
          </Link>
          <h1 className="text-xl font-bold">Review campus data</h1>
          <p>
            For the people who collect the data. Files you open here stay in this browser: nothing is uploaded. The
            guide is <code>docs/data-collection.md</code>.
          </p>
        </header>

        <ApprovedSummary state={approved} live={live} />

        <label className="block">
          <span className="font-semibold">Your name</span>, saved with everything you approve
          <input
            value={reviewer}
            autoComplete="name"
            onChange={(event) => {
              setReviewer(event.target.value);
              savedReviewer.write(event.target.value);
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          />
        </label>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => input.current?.click()}>Open candidate files</Button>
            <Button look="secondary" onClick={openEntrances} aria-pressed={view?.kind === "entrances"}>
              Place entrances
            </Button>
          </div>
          <input
            ref={input}
            type="file"
            multiple
            accept=".geojson,.json,application/json,application/geo+json"
            className="hidden"
            data-testid="file-input"
            onChange={(event) => {
              void openFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
          <p className="text-ink-muted">
            Or drop them on this page. The importers put them in <code>data-candidates/osm</code> and{" "}
            <code>raw-data/candidates</code>.
          </p>
          {problems.length > 0 && (
            <ul role="alert" data-testid="file-problems" className="space-y-1 rounded-lg bg-danger-surface p-3 text-danger">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>

        {files.length > 0 && (
          <nav aria-label="Open files" className="flex flex-wrap gap-2">
            {files.map((file) => (
              <Button
                key={file.name}
                look={active?.name === file.name ? "primary" : "secondary"}
                aria-current={active?.name === file.name ? "true" : undefined}
                onClick={() => openView(file)}
              >
                {file.name} ({file.items.length})
              </Button>
            ))}
          </nav>
        )}

        <Legend theme={theme} />

        {active && (
          <FileReview
            key={active.name}
            open={active}
            isApproved={isApproved}
            chosen={chosenSet}
            onChoose={choose}
            access={access[active.name] ?? null}
            onAccess={(value) => setAccess((current) => ({ ...current, [active.name]: value }))}
            unconnected={preview.unconnected}
            lengthM={preview.lengthM}
            reviewer={reviewer}
            onShow={(item: ReviewItem) => item.geometry && show(positionsOf(item.geometry))}
            onPlaceEntrances={openEntrances}
          />
        )}
        {view?.kind === "entrances" && (
          <EntranceTool
            buildings={trustedBuildings}
            door={door}
            missed={missed}
            junctions={junctions}
            picked={picked}
            onPick={setPicked}
            drafts={drafts}
            approvedIds={approvedEntranceIds}
            onAdd={(draft) => {
              changeDrafts([...drafts, draft]);
              setDoor(null);
            }}
            onRemove={(id) => changeDrafts(drafts.filter((draft) => draft.id !== id))}
            onShow={(position) => show([position])}
            reviewer={reviewer}
          />
        )}
        {!view && files.length === 0 && (
          <p className="text-ink-muted">Open a file to start, or place entrances once buildings and paths are approved.</p>
        )}

        <p className="border-t border-line pt-4 text-xs text-ink-muted">{DISCLAIMER}.</p>
      </div>

      <div
        role="region"
        aria-label="Map. Clicking a candidate chooses it, like its box in the list."
        className="relative h-[45dvh] shrink-0 border-b border-line md:h-auto md:flex-1 md:border-b-0 md:border-l"
      >
        <ReviewMap
          theme={theme}
          data={mapData}
          frame={frame}
          attribution={OSM_CREDIT}
          onClick={onMapClick}
          onProblem={setMapProblem}
        />
        {mapProblem && (
          <p role="alert" className="absolute inset-x-3 top-3 rounded-xl bg-warn-surface px-4 py-2 text-sm text-warn shadow">
            {mapProblem}
          </p>
        )}
      </div>
    </main>
  );
}

// --- The approved data -----------------------------------------------------------

interface ApprovedData {
  status: "loading" | "ready" | "failed";
  /** Kept while it is reloaded. */
  dataset: PublishedDataset | null;
  reload: () => void;
}

/** What the app shows right now. `npm run data:approve` publishes it again after each approval. */
function useApprovedData(): ApprovedData {
  const [state, setState] = useState<Omit<ApprovedData, "reload">>({ status: "loading", dataset: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadDataset(controller.signal, (url, init) => fetch(url, { ...init, cache: "no-store" })).then(
      (dataset) => setState({ status: "ready", dataset }),
      () => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, status: "failed" }));
      },
    );
    return () => controller.abort();
  }, [attempt]);

  return {
    ...state,
    reload: () => {
      setState((current) => ({ ...current, status: "loading" }));
      setAttempt((count) => count + 1);
    },
  };
}

function ApprovedSummary({ state, live }: { state: ApprovedData; live: PublishedDataset | null }) {
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let text: string;
  if (!state.dataset) {
    text = state.status === "failed" ? "The approved data can't be loaded. Is npm run dev still running?" : "Loading the approved data…";
  } else if (!live) {
    text = "Nothing is approved yet. Until then the app shows the made-up demo campus.";
  } else {
    const parts = [
      live.boundaryTrusted ? "the campus outline" : "no campus outline",
      count(live.buildings.length, "building", "buildings"),
      `${count(live.paths.length, "path", "paths")} (${live.routablePathIds.length} used for routes)`,
      count(live.entrances.length, "entrance", "entrances"),
      count(live.places.length, "place", "places"),
      count(live.rooms.length, "room", "rooms"),
    ];
    const guidance = live.live.available ? "Real guidance is available." : `No real guidance yet: ${live.live.reasons.join(" ")}`;
    text = `Approved: ${parts.join(", ")}. ${guidance}`;
  }

  return (
    <div className="space-y-2 rounded-xl bg-surface-2 p-3">
      <p data-testid="approved-summary" role="status">
        {text}
      </p>
      <Button look="secondary" onClick={state.reload} disabled={state.status === "loading"}>
        {state.status === "loading" && state.dataset ? "Reloading…" : "Reload approved data"}
      </Button>
    </div>
  );
}

function Legend({ theme }: { theme: ThemeName }) {
  const c = REVIEW_COLOURS[theme];
  const entries: [string, string, string][] = [
    ["Approved", c.approved, "solid"],
    ["Not chosen", c.open, "dashed"],
    ["Chosen", c.chosen, "solid"],
    ["Chosen, not connected", c.unconnected, "dotted"],
    ["Recorded walks and photos", c.hint, "dotted"],
    ["Entrances you place", c.draft, "solid"],
  ];
  return (
    <ul aria-label="What the colours on the map mean" className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {entries.map(([label, colour, style]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className="w-6 shrink-0 border-t-4" style={{ borderColor: colour, borderTopStyle: style as "solid" }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

// --- Map data ----------------------------------------------------------------------

function feature(geometry: GeoJSON.Geometry, properties: Record<string, unknown>): GeoJSON.Feature {
  return { type: "Feature", geometry, properties };
}

function approvedFeatures(live: PublishedDataset | null): FeatureCollection {
  if (!live) return EMPTY;
  const used = new Set(live.routablePathIds);
  return {
    type: "FeatureCollection",
    features: [
      ...(live.boundary ? [feature(live.boundary.geometry, { id: live.boundary.properties.id, label: "" })] : []),
      ...live.buildings.map(({ geometry, properties }) => feature(geometry, { id: properties.id, label: "" })),
      ...live.paths.map(({ geometry, properties }) => feature(geometry, { id: properties.id, label: "", used: used.has(properties.id) })),
      ...live.entrances.map(({ geometry, properties }) => feature(geometry, { id: properties.id, label: "" })),
    ],
  };
}

function hintFeatures(files: OpenFile[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: files.flatMap((file) =>
      file.items.flatMap((item) => (item.notApprovable && item.geometry ? [feature(item.geometry, { id: item.id, label: "" })] : [])),
    ),
  };
}

function candidateFeatures(
  items: ReviewItem[],
  isApproved: (item: ReviewItem) => boolean,
  chosen: ReadonlySet<string>,
  unconnected: ReadonlySet<string>,
): FeatureCollection {
  const stateOf = (item: ReviewItem) => {
    if (isApproved(item)) return "approved";
    if (item.notApprovable) return "blocked";
    if (!chosen.has(item.id)) return "open";
    return unconnected.has(item.id) ? "unconnected" : "chosen";
  };
  return {
    type: "FeatureCollection",
    features: items.flatMap((item) =>
      item.geometry
        ? [feature(item.geometry, { id: item.id, state: stateOf(item), label: item.geometry.type === "LineString" ? "" : item.title })]
        : [],
    ),
  };
}

function draftFeatures(drafts: EntranceDraft[], door: DoorSpot | null, junctions: Junction[], picked: string | null): FeatureCollection {
  const point = (position: LngLat, properties: Record<string, unknown>) =>
    feature({ type: "Point", coordinates: position }, properties);
  return {
    type: "FeatureCollection",
    features: [
      ...drafts.map((draft) => point(draft.position, { id: draft.id, role: "entrance", label: draft.name })),
      ...(door
        ? [
            ...junctions.map((junction) =>
              point(junction.position, { id: junction.nodeId, role: junction.nodeId === picked ? "picked" : "junction", label: "" }),
            ),
            point(door.position, { id: "door", role: "door", label: "" }),
          ]
        : []),
    ],
  };
}

function around([lng, lat]: LngLat): Bounds {
  return [lng - START_DEG, lat - START_DEG, lng + START_DEG, lat + START_DEG];
}

function boundsCorners([west, south, east, north]: Bounds): LngLat[] {
  return [
    [west, south],
    [east, north],
  ];
}
