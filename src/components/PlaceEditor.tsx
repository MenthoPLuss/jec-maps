"use client";

import { useMemo, useState } from "react";

type Coordinates = {
  lng: number;
  lat: number;
};

type PlaceEditorProps = {
  coordinates: Coordinates | null;
};

export default function PlaceEditor({
  coordinates,
}: PlaceEditorProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Academic");
  const [copied, setCopied] = useState(false);

  const id = useMemo(() => {
    return name
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }, [name]);

  const generatedCode = useMemo(() => {
    if (!coordinates || !name.trim()) {
      return "";
    }

    return `{
  id: "${id}",
  name: "${name.trim()}",
  category: "${category}",
  coordinates: [${coordinates.lng.toFixed(7)}, ${coordinates.lat.toFixed(7)}],
},`;
  }, [coordinates, name, category, id]);

  const copyCode = async () => {
    if (!generatedCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCode);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch (error) {
      console.error("Failed to copy place code:", error);
    }
  };

  if (!coordinates) {
    return (
      <div className="absolute bottom-4 left-4 z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 text-black shadow-xl">
        <div className="font-bold">
          JEC Map Editor
        </div>

        <div className="mt-2 text-sm text-gray-500">
          Click a location on the map first.
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-30 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-4 text-black shadow-xl">
      <div className="font-bold">
        JEC Map Editor
      </div>

      <div className="mt-1 text-xs text-gray-500">
        Add the selected campus location.
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Longitude
      </div>

      <div className="font-mono text-sm">
        {coordinates.lng.toFixed(7)}
      </div>

      <div className="mt-2 text-xs text-gray-500">
        Latitude
      </div>

      <div className="font-mono text-sm">
        {coordinates.lat.toFixed(7)}
      </div>

      <input
        type="text"
        placeholder="Place name"
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setCopied(false);
        }}
        className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-black outline-none"
      />

      <select
        value={category}
        onChange={(event) => {
          setCategory(event.target.value);
          setCopied(false);
        }}
        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-black outline-none"
      >
        <option value="Academic">
          Academic
        </option>

        <option value="Administration">
          Administration
        </option>

        <option value="Hostel">
          Hostel
        </option>

        <option value="Sports">
          Sports
        </option>

        <option value="Food">
          Food
        </option>

        <option value="Gate">
          Gate
        </option>

        <option value="Library">
          Library
        </option>

        <option value="Medical">
          Medical
        </option>

        <option value="Event">
          Event
        </option>

        <option value="Other">
          Other
        </option>
      </select>

      {generatedCode && (
        <>
          <div className="mt-4 text-xs font-semibold">
            Generated Code
          </div>

          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-gray-100 p-3 text-xs">
            {generatedCode}
          </pre>

          <button
            type="button"
            onClick={copyCode}
            className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
          >
            {copied
              ? "Copied!"
              : "Copy Place Code"}
          </button>
        </>
      )}
    </div>
  );
}