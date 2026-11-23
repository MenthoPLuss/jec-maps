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
| `data:approve` | candidates | `src/data/live`, never overwriting, then `public/data` |
| `data:validate` | `src/data` | nothing |
| `data:demo` | nothing | `src/data/demo` |

Candidates are proposals. The app never reads them.

The review page (`/review`) helps with `data:approve`. A person opens candidate
files in it, and they stay in the browser. It shows them over the approved data,
says which chosen paths would not join the network, and writes the command. For
entrances it writes a candidate file to download. It writes nothing itself and
sends nothing anywhere. It exists with `npm run dev` and in demo builds; a normal
build answers "not found".

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

## What the app knows, kept apart

| Piece | Who changes it |
| ----- | -------------- |
| Position and its quality | the GPS |
| On campus or not | several reliable fixes, never one, never time alone |
| A question about a building | GPS near a door or a wall, or GPS that goes quiet at a door |
| Building, floor and room where you are | **only you** |
| Building and floor you are looking at | only you, and it moves nobody |
| Destination | only you |
| Route, progress, arrival | the route search, your position, or you |

All of it is one pure function: `reduce(state, event, now, world)` in
`src/lib/state`. It never reads a clock or a sensor, so every rule has a test. All
thresholds are in `src/lib/state/policy.ts`. They shape the interface; they are no
security.

`CampusController` connects it to the GPS, the clock and the route search. It lives
outside React, so a new position moves the dot without redrawing the interface.

## Routes

- Outside: A* over the usable paths, in metres. Both ends join the nearest path
  within 20 m, never through a building. The gap is drawn dashed: nobody has
  checked it. Without a path in reach there is a labelled straight line instead.
- Into or out of a room: one network of paths, doors, corridors, stairs and lifts,
  in seconds, without a heuristic.
- Progress is a projection onto the route. A new route is computed when the
  destination or a setting changes, or after leaving the route for a while.
- "Avoid stairs" removes stairs. If nothing is left, the app says so.
- Arrival needs two accurate fixes, three seconds apart. A door is never an arrival
  in a room.

## Tests

| Command | What it proves |
| ------- | -------------- |
| `npm test` | the rules, with made-up fixes and a controllable clock |
| `npm run test:e2e` | the app, in three builds: normal, demo, online map |

Every browser test also fails on a request to another site, on any request that
carries a coordinate, and on an error in the console.
