# Collecting campus data

A guide for students. You don't need to know how to program for most of it.

## Before you start

- **Ask first.** Get permission from the college office before filming or
  photographing inside buildings. No permission, no recording.
- **No people.** Don't record faces, name badges, vehicle numbers or anyone who
  can be recognised. Go when it is empty: early, late, or during holidays.
- **No classes in session, exams, hostel rooms, staff offices or restricted
  areas.** If a sign says no entry, leave it out of the map.
- **Don't copy Google Maps**, or any other map or satellite view that does not
  allow tracing. Not even "just the shape".
- **Don't invent.** If you don't know something, leave it empty. Never add the
  demo campus to OpenStreetMap.
- Your media stays on your computer. Don't upload it to AI services.

## What is needed, most important first

| What | How | Needed for |
| ---- | --- | ---------- |
| The campus outline | Trace it in OpenStreetMap | Unlocking the map |
| Walking paths | Trace them, check them with recorded walks | Routes |
| Entrances | Photos at each door | Routes to buildings |
| Places | A spreadsheet | Search |
| Rooms | Photos of room plates, a spreadsheet | Finding rooms |
| Floor plans | Walkthrough videos | Indoor maps |

Without a **reviewed outline and reviewed paths** the app will not guide anyone.

## 1. Outline and paths: OpenStreetMap

1. Make an account at <https://www.openstreetmap.org>.
2. Go to the campus and press **Edit**. The editor is called iD. It has a
   walkthrough: do it once.
3. Choose one of the satellite images that iD offers. Those may be traced.
   Images can be shifted by a few metres: compare with existing roads first.
4. Draw the campus outline as an area and tag it `amenity=college` and
   `name=Jorhat Engineering College`. There was no such outline when this guide
   was written.
5. Draw footpaths as lines tagged `highway=footway`, and stairs as
   `highway=steps`. **Where two paths really meet, join them at a shared point.**
   A bridge over a road must not share a point with it.
6. Add `access` only if you know it, and gates as points with `barrier=gate`.
7. Save with a short comment. It takes a few minutes to appear.

Then, in this project:

```bash
npm run data:osm                 # writes candidates to data-candidates/osm
npm run data:osm -- --dry-run    # only shows what would change
```

Look at the files (drop them on <https://geojson.io>, or open them in QGIS).
Approve the good ones:

```bash
npm run data:approve -- --file data-candidates/osm/boundaries.candidates.geojson --ids jorhat-engineering-college --reviewer "Your name"
npm run data:approve -- --file data-candidates/osm/buildings.candidates.geojson --ids jec-library,jec-canteen --reviewer "Your name"
npm run data:approve -- --file data-candidates/osm/paths.candidates.geojson --ids osm-way-1-1,osm-way-1-2 --access public --reviewer "Your name"
```

**Approving means: I have been there and it is right.** Only approve a path as
`public` if you have walked it yourself and nothing stopped you.

Approved records are never overwritten. If OpenStreetMap changes later, the
import tells you the difference and keeps yours.

## 2. Recorded walks (GPX)

They help to check paths that the satellite image hides.

1. Install **OsmAnd** (Android, iPhone) or **Geo Tracker** (Android).
2. Outside, wait until the accuracy is better than 5 m.
3. Walk in the middle of the path at a normal pace. Pause for a few seconds at
   each junction. Walk important paths twice.
4. Export as GPX, put it in `raw-data/tracks/`, run `npm run data:build`.

A recorded walk is **never** used for routes by itself. It is a drawing to
compare with. Delete the part from your home to the campus before sharing it
with anyone.

## 3. Entrances

1. Switch on location in the camera app.
2. Stand 1 to 2 m in front of the door, hold still for ten seconds, take the
   photo. One photo per entrance.
3. Send the **original file** (cable, Google Drive, email). WhatsApp and
   Telegram remove the position.
4. Put it in `raw-data/<building-id>/outside/` and run `npm run data:build`.

The report `raw-data/candidates/entrances.report.json` lists the positions. They
can be off by many metres, so use them as a hint. Add the entrance to
`src/data/live/entrances.geojson` yourself, with the junction of the path that
leads to it, and list it in its building's `entranceIds`.

## 4. Places and rooms

Copy `raw-data/places.template.csv` to `raw-data/places.csv`, and the same for
rooms. [raw-data/README.md](../raw-data/README.md) explains the columns.

For rooms, photograph each door plate straight on. Photograph the evacuation map
of each floor if there is one and you are allowed to. Type the room number
exactly as it is on the plate.

```bash
npm run data:build
npm run data:approve -- --file raw-data/candidates/places.candidates.geojson --all --reviewer "Your name"
npm run data:approve -- --file raw-data/candidates/rooms.candidates.json --all --reviewer "Your name"
```

## 5. Walkthrough videos

One video per floor, for [drawing the floor plan](indoor-data.md).

- Hold the phone sideways (landscape). Walk slowly, one step per second.
- Start outside the entrance and say the building, the floor and the date.
- Stop at every door, film the plate for two seconds and read it out loud.
- Say where you turn: "turning left, towards the stairs".
- Count your steps between doors and say the number.
- Film the stairs and the lift, and say which floors they reach.
- Film the same corridor once in each direction.

## 6. Check your work

```bash
npm run data:validate
```

It checks everything, and says which file, record and field is wrong. It also
says whether real guidance is available, and which paths are left out and why.

## Licence of the data

Data from OpenStreetMap is © OpenStreetMap contributors, under the
[ODbL](https://opendatacommons.org/licenses/odbl/). The credit has to stay
visible, and data derived from it has to be shared under the same licence.
