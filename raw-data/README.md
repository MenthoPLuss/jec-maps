# raw-data

Put your spreadsheets, recorded walks, photos and videos here. **Everything in
this folder stays on your computer**: Git ignores it, except for this file and
the two templates.

```text
raw-data/
  places.csv                    copy of places.template.csv, filled in
  rooms.csv                     copy of rooms.template.csv, filled in
  tracks/*.gpx                  walks recorded on campus
  <building-id>/outside/*.jpg   original photos of entrances
  <building-id>/level-0/        your own walkthrough videos and room-plate photos
  candidates/                   written by npm run data:build
```

How to collect all this: [docs/data-collection.md](../docs/data-collection.md).

## Filling in the spreadsheets

- Keep the header line as it is. Delete the example lines.
- `lat` and `lng` are separate columns with plain numbers: `26.7441556` and
  `94.2506399`. The importer puts them in the right order for the map.
- Several values in one cell are separated by `|`: `front gate|gate 1`.
- `room_number` is text. Type it exactly as on the plate, such as `007`. In
  Excel, format the column as Text first, or Excel removes the zeros.
- `level` is a whole number: 0 is the ground floor, -1 a basement.
- Leave `id` empty to let the importer make one from the name.
- `accuracy_m` needs an `accuracy_note` saying how you measured it. If you did
  not measure it, leave both empty.

Then run `npm run data:build`. It checks every line and writes nothing if one of
them is wrong.
