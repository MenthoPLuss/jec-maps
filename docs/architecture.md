# How it works

## The rules behind the design

1. **The position never leaves the device.** There is no server code that could
   receive it.
2. **Nothing is presented as more certain than it is.** A position is an
   estimate. A building, floor or room is confirmed by the user, never guessed.
3. **Made-up data never guides a real person.** That holds even if someone walks
   through the real campus with the demo campus loaded.
4. **No shortcuts.** Routes use reviewed, connected paths and nothing else.

## From files to the map

```text
src/data/demo or src/data/live     checked into Git
        |  scripts/publish-data.ts  Zod schemas + cross-checks, stops on errors
        v
public/data/core.json              everything except floor plans
public/data/indoor/<building>.json floor plans, downloaded when needed
        |  fetch
        v
the app
```

`public/data` is written before every `npm run dev` and `npm run build`, and is
not in Git. The live dataset is used as soon as
`src/data/live/dataset-manifest.json` exists. `JEC_DATASET=demo` forces the demo.

| Command | Reads | Writes |
| ------- | ----- | ------ |
| `data:osm` | OpenStreetMap, only when you run it | candidates in `data-candidates/osm` |
| `data:build` | `raw-data` on this computer | candidates in `raw-data/candidates` |
| `data:approve` | candidates | `src/data/live`, never overwriting |
| `data:validate` | `src/data` | nothing |
| `data:demo` | nothing | `src/data/demo` |

Candidates are proposals. The app never reads them.

## When is real guidance allowed?

| | Demo data | Live data, outline and paths reviewed |
| --- | --- | --- |
| Fake GPS (demo builds only) | Everything, with both badges | Everything, with the mock badge |
| Real GPS | Look at the map, check the signal. No dot, no distance, no route | Everything |

With live data that is not reviewed yet, real GPS gets the same as in the demo.
A path counts only if it is `reviewed`, not a `placeholder`, has `public` access
and is connected to the main network. `npm run data:validate` lists what is left
out and why.

## The base map

- **Local** (default): a plain background and the campus shapes. Nothing is
  loaded from other sites. MapLibre draws the labels with the device's fonts.
- **Online**: only if the build sets `NEXT_PUBLIC_BASEMAP_MODE=online` **and** the
  visitor agrees. The provider then sees which map tiles are requested. The map
  can't be moved far from the campus, so the tiles never show anyone's home.

If the online map fails, the local one comes back. A new style or a graphics
reset wipes the map: `LayerRegistry` then puts every source and layer back with
the current data.

## Coordinates and units

Always `[longitude, latitude]`, metres and seconds. "lat, lng" is turned around in
exactly three places: the CSV importer, the GPX/photo/OpenStreetMap importers, and
the adapter for the browser's location.
