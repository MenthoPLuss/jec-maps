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
| 4 | Real GPS and a fake GPS for testing | Next |
| 5 | "Are you on campus?" logic | Planned |
| 6 | Search, walking routes, arrival: the MVP | Planned |
| 7 | Building, floor and room guidance | Planned |
| 8 | Polish, accessibility, "Add to Home Screen" | Planned |
| 9 | Full browser tests and release notes | Planned |

**There is no surveyed campus data yet.** Until there is, the app can only be
demonstrated with made-up data and a fake GPS. It must not be used to find your
way around the real campus.

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
| `npm run dev` | Development server |
| `npm run build` then `npm start` | The real, optimised site |
| `npm run lint` | Find code problems |
| `npm run typecheck` | Check the TypeScript types |
| `npm test` | Unit tests |
| `npm run test:e2e` | Browser tests. The first time, run `npx playwright install chromium` |
| `npm run data:validate` | Check the campus data |

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
