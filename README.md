# JEC Maps

> **Unofficial student project, not affiliated with Jorhat Engineering College.**

JEC Maps is a campus navigation web app for phones. It shows where you are on
campus, walks you to a building, and helps you find a room. It is being built by
a student, in the open, one phase at a time.

## Status

| Phase | What it adds | State |
| ----- | ------------ | ----- |
| 1 | Clean repository, tests, CI | Done |
| 2 | Map foundation that works without any outside service | Done |
| 3 | Campus data format, demo campus, import scripts | Done |
| 4 | Real GPS and a fake GPS for testing | Done |
| 5 | "Are you on campus?" logic | Done |
| 6 | Search, walking routes, arrival: the MVP | Done |
| 7 | Building, floor and room guidance | Next |
| 8 | Polish, accessibility, "Add to Home Screen" | Planned |
| 9 | Full browser tests and release notes | Planned |

**There is no surveyed campus data yet.** Until there is, the app can only be
demonstrated with made-up data and a fake GPS. It must not be used to find your
way around the real campus.

## What it does

- Locked outside campus, with the distance. It unlocks on campus.
- A blue dot with a circle of uncertainty in metres, and "centre on me".
- Search by name, alias, department or room number, with the keyboard too.
- One destination: from the search, a long press, a click, or the middle of the map.
- Walking routes over reviewed paths, with distance, time and arrival. Ground that
  nobody checked is dashed. Without a route there is a labelled straight line.
- It asks whether you are inside a building. It never decides that for you.
- Works without any other site: no tiles, fonts or trackers.

## Run it

You need [Node.js](https://nodejs.org) 22.12 or newer (22 and 24 are the
long-term versions) and Git. The commands are the same on Windows, macOS and
Linux.

```bash
git clone https://github.com/MenthoPLuss/jec-maps.git
cd jec-maps
npm ci
npm run dev
```

Open <http://localhost:3000>.

| Command | What it does |
| ------- | ------------ |
| `npm run demo` | Development server with the fake GPS: open <http://localhost:3000/?mock=1> |
| `npm run dev` | Development server |
| `npm run build` then `npm start` | The real, optimised site |
| `npm run lint` | Find code problems |
| `npm run typecheck` | Check the TypeScript types |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests. The first time, run `npx playwright install chromium` |
| `npm run data:validate` | Check the campus data |

## Try it with a fake GPS

```bash
npm run demo
```

1. Open <http://localhost:3000/?mock=1>.
2. Press **MOCK GPS** at the top, choose **Outside → into campus**.
3. Press **Enable location**. The map unlocks when the fake user walks in.
4. Search for "canteen". A route appears.
5. Press **MOCK GPS** again, then **Walk the route**.

`?mock=1` needs a build that allows it (`NEXT_PUBLIC_ENABLE_DEMO=1`, which
`npm run demo` sets). In a normal build it does nothing.

## Test it on your phone

Browsers share the location only with https addresses. `http://192.168.x.x:3000`
does not count, even in your own Wi-Fi. Use a tunnel to a production build:

```bash
npm run build
npm start
```

and in a second terminal, with
[cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)
installed:

```bash
cloudflared tunnel --url http://localhost:3000
```

Open the https address that it prints. While the tunnel runs, anyone with that
address can open the app, so stop it when you are done. With the demo data the
app only checks your signal; it does not guide you.

## Settings

Copy [.env.example](.env.example) to `.env.local` and edit the copy. Every
setting is explained inside. None of them is a secret: they all end up in the
browser.

## Campus data

The app shows a made-up demo campus until real, reviewed data exists.

- [Collecting campus data](docs/data-collection.md): the guide for students
- [Floor plans](docs/indoor-data.md): how they are drawn, and how far to trust them
- [How it works](docs/architecture.md): from files to the map, and the rules

## Data conventions

- Coordinates are always `[longitude, latitude]`. Google Maps and most
  spreadsheets show them the other way round.
- Distances are metres and times are seconds. They are only formatted on screen.
- Ids are lower-case words joined by dashes, such as `main-gate`.
- Floors are whole numbers. 0 is the ground floor.

## Privacy

Your position stays on your device. The app has no accounts, no analytics and no
server of its own that receives coordinates. Your browser and phone decide how
they work out your position, and they have their own privacy rules.

## Credits

- Map engine: [MapLibre GL JS](https://maplibre.org) (BSD-3-Clause)
- Map data, where it is used:
  [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL)
