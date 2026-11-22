"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { PublishedDataset } from "@/lib/data/published";
import type { CampusSearch, SearchItem } from "@/lib/search/search";

interface SearchBoxProps {
  dataset: PublishedDataset;
  onSelect: (item: SearchItem) => void;
}

/** Search by name, alias, category, building or room number. Works with the keyboard alone. */
export default function SearchBox({ dataset, onSelect }: SearchBoxProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [wanted, setWanted] = useState(false);
  const [search, setSearch] = useState<CampusSearch | null>(null);

  // The search engine is only downloaded when somebody is about to search.
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    void import("@/lib/search/search").then(({ CampusSearch }) => {
      if (current) setSearch(new CampusSearch(dataset));
    });
    return () => {
      current = false;
    };
  }, [dataset, wanted]);

  const open = query.trim() !== "";
  const hits = open && search ? search.find(query) : [];
  const selected = Math.min(active, hits.length - 1);

  const choose = (item: SearchItem) => {
    // Closes the keyboard of a phone, which would cover the result.
    input.current?.blur();
    onSelect(item);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") setQuery("");
    if (!open || hits.length === 0) return;
    if (event.key === "ArrowDown") setActive((selected + 1) % hits.length);
    else if (event.key === "ArrowUp") setActive((selected - 1 + hits.length) % hits.length);
    else if (event.key === "Enter") choose(hits[selected]);
    else return;
    event.preventDefault();
  };

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl bg-surface text-ink shadow-lg">
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search the campus"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && hits.length > 0 ? `${id}-${selected}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search a place or room"
        value={query}
        onFocus={() => setWanted(true)}
        onChange={(event) => {
          setWanted(true);
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="min-h-11 w-full rounded-xl bg-transparent px-4 py-3 placeholder:text-ink-muted"
      />

      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Results"
        hidden={!open}
        className="max-h-[45dvh] overflow-y-auto border-t border-line"
      >
        {hits.map((item, index) => (
          <li
            key={item.key}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === selected}
            // Keeps the focus in the input, so that the keyboard still works.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item)}
            className={`min-h-11 cursor-pointer px-4 py-2 ${index === selected ? "bg-surface-2" : ""}`}
          >
            <span className="block font-semibold">{item.name}</span>
            <span className="block text-sm text-ink-muted">{item.detail}</span>
          </li>
        ))}
      </ul>
      {open && hits.length === 0 && (
        <p role="status" className="px-4 py-3 text-ink-muted">
          {search ? "Nothing found" : "Searching…"}
        </p>
      )}
    </div>
  );
}
