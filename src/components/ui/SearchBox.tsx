"use client";

import { useState } from "react";

import { centroidOf } from "@/lib/geo/area";
import type { LngLat } from "@/lib/geo/types";
import type { PublishedDataset } from "@/lib/data/published";

export interface SearchHit {
  id: string;
  name: string;
  kind: string;
  position: LngLat;
}

export default function SearchBox({ dataset, onSelect }: { dataset: PublishedDataset; onSelect: (hit: SearchHit) => void }) {
  const [query, setQuery] = useState("");
  const wanted = query.trim().toLowerCase();

  const hits: SearchHit[] = [
    ...dataset.buildings.map((building) => ({
      id: building.properties.id,
      name: building.properties.name,
      kind: "building",
      position: centroidOf(building.geometry),
    })),
    ...dataset.places.map((place) => ({
      id: place.properties.id,
      name: place.properties.name,
      kind: place.properties.category,
      position: place.geometry.coordinates,
    })),
  ].filter((hit) => hit.name.toLowerCase().includes(wanted));

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl bg-surface text-ink shadow-lg">
      <input
        type="search"
        aria-label="Search the campus"
        placeholder="Search the campus"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="min-h-11 w-full rounded-xl bg-transparent px-4 py-3"
      />

      {wanted && (
        <ul className="max-h-60 overflow-y-auto border-t border-line">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(hit);
                  setQuery("");
                }}
                className="block min-h-11 w-full px-4 py-2 text-left hover:bg-surface-2"
              >
                <span className="block font-semibold">{hit.name}</span>
                <span className="block text-sm text-ink-muted">{hit.kind}</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-4 py-3 text-ink-muted">Nothing found</li>}
        </ul>
      )}
    </div>
  );
}
