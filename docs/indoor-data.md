# Floor plans

## What they are

There are no official blueprints. A floor plan in this project is a **sketch that
a person draws** from permitted photos and walkthrough videos. It shows which
room is next to which, and how the corridors connect.

It is not surveyed. It is not for emergencies, building work or wheelchair
planning. How far off it is depends on who drew it, so every record says:

| `accuracy.status` | Meaning |
| ----------------- | ------- |
| left out, or `unknown` | Nobody knows. This is the normal case |
| `estimated` | Somebody compared it with something. The note says with what |
| `verified` | Somebody measured it. The note says how, `metres` says the result |

Don't write a number that nobody measured.

No program turns your videos into a plan. Watching, drawing and checking is work
for people, and one person should check what another one drew.

## Drawing a floor

1. Get the outline of the building from `src/data/live/buildings.geojson`.
2. Watch the video and note, in order: doors, their side, step counts, turns,
   stairs.
3. Draw in [QGIS](https://qgis.org) or <https://geojson.io>, on top of the
   outline. If the steps add up to more or less than the outline, stretch your
   sketch to fit the outline.
4. Save it as `src/data/live/buildings/<building-id>/level-<n>.geojson` and list
   it in `dataset-manifest.json` under `files.levels`.
5. Run `npm run data:validate` until it has no errors.
6. Walk the floor with the result in your hand. Then set `reviewStatus` to
   `reviewed`, with `reviewedBy` and `reviewedOn`.

The demo campus has two finished examples:
[level 0](../src/data/demo/buildings/demo-block-a/level-0.geojson) and
[level 1](../src/data/demo/buildings/demo-block-a/level-1.geojson).

## The four kinds of features

| `featureType` | Shape | Important fields |
| ------------- | ----- | ---------------- |
| `room` | Polygon | `roomId` from rooms.json |
| `corridor` | Line | `fromNode`, `toNode`, `access` |
| `door` | Point | `roomId`, `nodeId`: the corridor junction in front of it |
| `vertical` | Point | `kind` (stairs or lift), `connectorId`, `nodeId`, `connects` |

- Corridors meet only where they share a junction. Cut them where they meet, and
  in front of every door.
- Each floor has its own junctions. `demo-a0-stairs` and `demo-a1-stairs` are two
  different ones, joined by a `vertical` feature on each floor.
- `connectorId` is the same on every floor that the stairs or lift reach.
- An entrance is linked through its `indoorNodeId`.

## "The third door on the right"

The app only says this when a person has counted. Add `order` to the door:

```json
"order": [{ "fromNode": "demo-a1-stairs", "side": "left", "index": 2 }]
```

It means: coming from junction `demo-a1-stairs`, it is the 2nd door on the left.
Without it the app gives a simpler instruction.

## Step-free routes

"Avoid stairs" leaves stairs out. It does not promise that a wheelchair gets
through: doors, ramps and lifts may still be a problem. When the app does not
know a way without stairs, it says so. It never falls back to stairs.

## When something is wrong

Rooms get renamed and walls get moved. Change the record, set `reviewStatus` back
to `unreviewed` until someone has checked it, and run `npm run data:validate`. If
a plan is badly wrong, set its records to `rejected`: the app then shows the list
of rooms instead.

## A floor without a plan

That is fine. With rooms in `rooms.json` the app shows a list by floor, routes to
the entrance and shows the `near` hint, such as "second door after the stairs".
