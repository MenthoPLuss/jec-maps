# Performance

Measured on 2026-11-23 with Lighthouse 13.6, mobile profile (simulated slow 4G,
CPU slowed down four times), Chromium 159 on Windows 11, production build, demo
campus, local base map. The number changes from run to run and from computer to
computer: it is a comparison, not a promise.

| Page | Performance | Accessibility | Best practices |
| ---- | ----------- | ------------- | -------------- |
| Start page, before this work | 56 | 100 | 100 |
| Start page, now (3 runs) | 75, 78, 75 | 100 | 100 |
| Start page, now, with a graphics card (3 runs) | 75, 79, 79 | | |
| Permission screen (`?mock=1`), with a graphics card | 81 | 100 | |

First paint 0.8 s, largest paint 0.8 to 2.8 s, blocking time about 0.7 to 1.0 s,
layout shift 0.

**The goal was 85, and it is not reached.** What is left is the map engine:
MapLibre needs about one second of (slowed down) processor time to start. What was
done about it:

- the page itself has text to read, before any script runs
- the interface loads first, the map engine in the next quiet moment
- search and floor plans are only downloaded when they are needed
- no fonts, trackers or tiles from anywhere
- a new position moves the dot without redrawing the interface

What would help further: a smaller map engine, or starting it only when the map is
about to be used. The second would hide the campus from people who are just
looking, so it was not done.

## Measure it again

```bash
npm run build
npm start
npx lighthouse http://localhost:3000 --only-categories=performance,accessibility
```
