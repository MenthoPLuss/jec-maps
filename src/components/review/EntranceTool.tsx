"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import type { BuildingFeature } from "@/lib/data/schemas";
import type { LngLat } from "@/lib/geo/types";
import { approveCommands, reviewerProblem } from "@/lib/review/commands";
import {
  ENTRANCES_FILE,
  ENTRANCE_ACCESS,
  JUNCTION_REACH_M,
  JUNCTION_WARNING_M,
  entranceIdFor,
  entrancesFileText,
  type DoorSpot,
  type EntranceAccess,
  type EntranceDraft,
  type Junction,
} from "@/lib/review/entrances";

import CommandBox from "./CommandBox";

interface EntranceToolProps {
  /** Approved buildings. */
  buildings: BuildingFeature[];
  door: DoorSpot | null;
  /** True when the last click was far from every wall. */
  missed: boolean;
  junctions: Junction[];
  picked: string | null;
  onPick: (nodeId: string) => void;
  drafts: EntranceDraft[];
  /** Ids of the entrances that are approved already. */
  approvedIds: ReadonlySet<string>;
  onAdd: (draft: EntranceDraft) => void;
  onRemove: (id: string) => void;
  onShow: (position: LngLat) => void;
  reviewer: string;
}

export default function EntranceTool(props: EntranceToolProps) {
  const { buildings, door, missed, drafts, approvedIds, onRemove, onShow, reviewer } = props;
  const pending = drafts.filter((draft) => !approvedIds.has(draft.id));
  const nameOf = (id: string) => buildings.find((building) => building.properties.id === id)?.properties.name ?? id;

  if (buildings.length === 0) {
    return (
      <section aria-labelledby="entrances-title" className="space-y-3">
        <h2 id="entrances-title" className="font-bold">
          Entrances
        </h2>
        <p>
          Approve the buildings and the paths first. An entrance belongs to an approved building and opens onto an
          approved path.
        </p>
      </section>
    );
  }

  const download = () => {
    const blob = new Blob([entrancesFileText(pending)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = ENTRANCES_FILE;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const problem = reviewerProblem(reviewer);

  return (
    <section aria-labelledby="entrances-title" className="space-y-4">
      <h2 id="entrances-title" className="font-bold">
        Entrances
      </h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Click the map where the door is, on the wall of an approved building.</li>
        <li>Name it, and choose the path junction in front of it.</li>
        <li>Download the file, then approve it with the command.</li>
      </ol>

      {missed && !door && (
        <p role="status" className="font-medium text-warn">
          That is not next to an approved building. Click on its wall.
        </p>
      )}
      {door && <DoorForm key={door.position.join()} {...props} door={door} buildingName={nameOf(door.buildingId)} />}

      {drafts.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold">Your entrances</h3>
          <ul className="divide-y divide-line border-y border-line" data-testid="entrance-drafts">
            {drafts.map((draft) => (
              <li key={draft.id} className="flex items-start gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{draft.name}</span>
                  <span className="block break-all text-xs text-ink-muted">
                    {nameOf(draft.buildingId)}, level {draft.level}, {draft.access} · {draft.id}
                  </span>
                  {approvedIds.has(draft.id) && <span className="block text-xs font-semibold text-good">Approved</span>}
                </span>
                <Button look="quiet" onClick={() => onShow(draft.position)} aria-label={`Show ${draft.name} on the map`}>
                  Show
                </Button>
                <Button look="quiet" onClick={() => onRemove(draft.id)} aria-label={`Remove ${draft.name}`}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <h3 className="font-bold">Approve your entrances</h3>
          <Button onClick={download}>Download {ENTRANCES_FILE}</Button>
          <p>
            Save it in the folder <code>raw-data/candidates</code> of the project, under exactly this name. Replace the
            old one if there is one.
          </p>
          {problem ? (
            <p data-testid="approve-problem" className="font-medium text-warn">
              {problem}
            </p>
          ) : (
            <CommandBox commands={approveCommands({ fileName: ENTRANCES_FILE, ids: pending.map((draft) => draft.id), reviewer })} />
          )}
        </div>
      )}
    </section>
  );
}

function DoorForm({
  door,
  buildingName,
  buildings,
  junctions,
  picked,
  onPick,
  drafts,
  approvedIds,
  onAdd,
}: EntranceToolProps & { door: DoorSpot; buildingName: string }) {
  const building = buildings.find((entry) => entry.properties.id === door.buildingId);
  const levels = building?.properties.levels ?? [{ ordinal: 0, name: "Ground floor" }];
  const [name, setName] = useState("");
  const [level, setLevel] = useState(String(building?.properties.defaultLevel ?? levels[0].ordinal));
  const [access, setAccess] = useState<EntranceAccess | "">("");

  const taken = new Set([...approvedIds, ...drafts.map((draft) => draft.id)]);
  const id = entranceIdFor(door.buildingId, name, taken);
  const junction = junctions.find((entry) => entry.nodeId === picked) ?? null;
  const missing = !id ? "a name" : !access ? "who may use it" : !junction ? "a junction" : null;

  const add = () => {
    if (missing || !junction || !access) return;
    onAdd({
      id,
      buildingId: door.buildingId,
      name: name.trim(),
      level: Number(level),
      access,
      outdoorNodeId: junction.nodeId,
      position: door.position,
    });
  };

  return (
    <form
      aria-label="New entrance"
      className="space-y-3 rounded-xl border border-line p-3"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <p>
        A door of <strong>{buildingName}</strong>
      </p>
      <label className="block">
        Name, such as &ldquo;Front door&rdquo;
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
        />
      </label>
      {id && <p className="break-all text-xs text-ink-muted">Its id will be {id}</p>}
      <label className="block">
        Floor
        <select
          value={level}
          onChange={(event) => setLevel(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
        >
          {levels.map((entry) => (
            <option key={entry.ordinal} value={entry.ordinal}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Who may use it
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as EntranceAccess | "")}
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
        >
          <option value="">Choose…</option>
          {ENTRANCE_ACCESS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {junctions.length === 0 ? (
        <p className="font-medium text-warn">
          No junction of an approved path is within {JUNCTION_REACH_M} m. Draw a footway to this door in OpenStreetMap,
          ending at the wall, approve it, and come back.
        </p>
      ) : (
        <label className="block">
          The path junction in front of it (marked on the map)
          <select
            value={picked ?? ""}
            onChange={(event) => onPick(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
          >
            {junctions.map((entry) => (
              <option key={entry.nodeId} value={entry.nodeId}>
                {entry.distanceM} m away · {entry.nodeId}
              </option>
            ))}
          </select>
        </label>
      )}
      {junction && junction.distanceM > JUNCTION_WARNING_M && (
        <p className="text-warn">
          That is more than {JUNCTION_WARNING_M} m from the door, so routes will draw a straight line to it. Better: draw
          a footway to the door in OpenStreetMap, ending at the wall.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={missing !== null}
          className="min-h-11 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          Add entrance
        </button>
        {missing && <span className="text-ink-muted">Still missing: {missing}.</span>}
      </div>
    </form>
  );
}
