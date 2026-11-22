"use client";

import { useState } from "react";

import { PLACE_CATEGORIES, type PlaceCategory } from "@/lib/data/constants";
import { PLACE_COLUMNS, csvRow } from "@/lib/data/csv";
import { toKebabId } from "@/lib/data/ids";
import type { LngLat } from "@/lib/geo/types";

import Button from "./Button";

/** A demo tool (?edit=1): click the map, get a line for raw-data/places.csv. */
export default function PlaceEditor({ position }: { position: LngLat | null }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory>("department");
  const [message, setMessage] = useState("");

  const id = toKebabId(name);
  const row =
    position && id
      ? csvRow(PLACE_COLUMNS, {
          id,
          name: name.trim(),
          category,
          lat: position[1].toFixed(7),
          lng: position[0].toFixed(7),
          source: "map editor",
          review_status: "unreviewed",
        })
      : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(row);
      setMessage("Copied. Paste it into raw-data/places.csv.");
    } catch {
      setMessage("Copying is blocked. Select the line and copy it yourself.");
    }
  };

  return (
    <section
      aria-label="Place editor"
      className="pointer-events-auto w-full max-w-sm space-y-2 rounded-2xl bg-surface p-4 text-sm text-ink shadow-xl"
    >
      <h2 className="font-bold">Place editor</h2>
      {!position && <p className="text-ink-muted">Click the map first.</p>}
      {position && (
        <>
          <p className="font-mono text-xs">
            lat {position[1].toFixed(7)}, lng {position[0].toFixed(7)}
          </p>
          <label className="block">
            Name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setMessage("");
              }}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
            />
          </label>
          <label className="block">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as PlaceCategory)}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-surface px-3"
            >
              {PLACE_CATEGORIES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {row && (
            <>
              <pre className="overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs">{row}</pre>
              <Button onClick={copy}>Copy line</Button>
            </>
          )}
          <p role="status">{message}</p>
        </>
      )}
    </section>
  );
}
