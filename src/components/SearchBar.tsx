"use client";

import { useState } from "react";
import { places, Place } from "@/data/places";

type SearchBarProps = {
  onSelectPlace: (place: Place) => void;
};

export default function SearchBar({
  onSelectPlace,
}: SearchBarProps) {
  const [query, setQuery] = useState("");

  const filteredPlaces = places.filter((place) =>
    place.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="absolute left-1/2 top-4 z-10 w-[90%] max-w-md -translate-x-1/2">
      <div className="rounded-xl bg-white shadow-lg">
        <input
          type="text"
          placeholder="Search JEC..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-xl px-4 py-3 text-black outline-none"
        />

        {query && (
          <div className="border-t border-gray-200">
            {filteredPlaces.length > 0 ? (
              filteredPlaces.map((place) => (
                <button
                  key={place.id}
                  onClick={() => {
                    onSelectPlace(place);
                    setQuery("");
                  }}
                  className="block w-full px-4 py-3 text-left text-black hover:bg-gray-100"
                >
                  <div className="font-semibold">
                    {place.name}
                  </div>

                  <div className="text-sm text-gray-500">
                    {place.category}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-gray-500">
                No places found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}