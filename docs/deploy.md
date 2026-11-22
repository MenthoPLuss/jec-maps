# Putting it online

Nothing in this project deploys by itself. Do this when you want to.

## Before a public launch

- [ ] `npm run data:validate` says **Real guidance: available** for `live`.
- [ ] Somebody other than the person who drew it has walked the paths, opened the
      doors and checked the rooms.
- [ ] It was tried on an Android phone and an iPhone, outdoors, on the real campus.
- [ ] `NEXT_PUBLIC_ENABLE_DEMO` is not set to 1.
- [ ] The college does not mind. The app has to stay recognisable as unofficial.

Without reviewed data the site still works, as a demo to look at: it says so, and
guides nobody.

## Vercel

Browsers only share the location with https pages. Vercel provides that.

1. Sign in at <https://vercel.com> with GitHub and import the repository.
2. Keep the settings that it detects (Next.js, `npm run build`). Choose Node.js 22
   or 24.
3. Set these under Settings → Environment Variables. All of them are public.

   | Name | Value |
   | ---- | ----- |
   | `NEXT_PUBLIC_BASEMAP_MODE` | `local`, or `online` with a provider that you may use |
   | `NEXT_PUBLIC_TILE_URL` | only for `online` |
   | `NEXT_PUBLIC_TILE_ATTRIBUTION` | only for raster tiles |
   | `NEXT_PUBLIC_ENABLE_DEMO` | `0` for Production. `1` for Preview, if you like |

4. Deploy. Changed settings need a new deployment, because they are fixed while
   building.

Any other host that can run `npm run build` and `npm start` with https works too.

**Choosing an online map:** read the provider's terms first, look at limits and
price, and keep its credit line visible. A style address and a raster address are
not interchangeable: try the one you choose. OpenStreetMap's own tile server is
not meant for public apps. The default, `local`, needs no provider.

## On your phone, before it is online

`http://192.168.x.x:3000` is not enough: location needs https, or `localhost` on
the same device. From Windows, macOS or Linux:

```bash
npm run build
npm start
```

In a second terminal, one of:

```bash
cloudflared tunnel --url http://localhost:3000
```

```bash
ngrok http 3000
```

Open the https address that it prints on the phone. Anyone who has the address can
open the app while the tunnel runs, so stop it afterwards.

Use the production build as above. The development server (`npm run dev`) refuses
unknown addresses unless you add them to `allowedDevOrigins` in `next.config.ts`.

These commands were written from the documentation of the tools. They have not been
tried on a phone yet.

## What has been tested where

| | State |
| --- | --- |
| Windows 11, Node 26, Chromium | All checks and browser tests pass |
| Linux, macOS, Node 22 and 24 | Run by CI once it is on GitHub |
| Android, iPhone, Firefox, Safari | Not tested yet |
| The real campus, real GPS | Not tested yet |
