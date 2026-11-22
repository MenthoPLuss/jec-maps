import { describe, expect, it } from "vitest";

import { readPhotos, type PhotoFile } from "./exifReport";

/** The smallest JPEG with a GPS position: a TIFF block with one GPS directory. */
function jpegWithGps(lat: number, lng: number): Buffer {
  const entries = 4;
  const gpsOffset = 8 + 2 + 12 + 4;
  const dataOffset = gpsOffset + 2 + entries * 12 + 4;
  const tiff = Buffer.alloc(dataOffset + 48);

  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  // First directory: one entry, pointing to the GPS directory.
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(gpsOffset, 18);

  const entry = (index: number, tag: number, type: number, count: number, value: number | string) => {
    const offset = gpsOffset + 2 + index * 12;
    tiff.writeUInt16LE(tag, offset);
    tiff.writeUInt16LE(type, offset + 2);
    tiff.writeUInt32LE(count, offset + 4);
    if (typeof value === "string") tiff.write(value, offset + 8, "latin1");
    else tiff.writeUInt32LE(value, offset + 8);
  };
  tiff.writeUInt16LE(entries, gpsOffset);
  entry(0, 1, 2, 2, lat < 0 ? "S" : "N");
  entry(1, 2, 5, 3, dataOffset);
  entry(2, 3, 2, 2, lng < 0 ? "W" : "E");
  entry(3, 4, 5, 3, dataOffset + 24);

  const angle = (value: number, offset: number) => {
    const degrees = Math.floor(Math.abs(value));
    const minutes = Math.floor((Math.abs(value) - degrees) * 60);
    const seconds = (Math.abs(value) - degrees - minutes / 60) * 3600;
    [degrees, minutes].forEach((part, i) => {
      tiff.writeUInt32LE(part, offset + i * 8);
      tiff.writeUInt32LE(1, offset + i * 8 + 4);
    });
    tiff.writeUInt32LE(Math.round(seconds * 10_000), offset + 16);
    tiff.writeUInt32LE(10_000, offset + 20);
  };
  angle(lat, dataOffset);
  angle(lng, dataOffset + 24);

  const exif = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exif, Buffer.from([0xff, 0xd9])]);
}

const plainJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const photo = (name: string, bytes: Buffer, buildingId = "ee-dept"): PhotoFile => ({ buildingId, name, bytes });

describe("readPhotos", () => {
  it("suggests [lng, lat] and leaves the decision to a person", async () => {
    const { suggestions, issues } = await readPhotos([photo("door.jpg", jpegWithGps(26.7460082, 94.2498342))]);

    expect(issues).toEqual([]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ buildingId: "ee-dept", photo: "door.jpg", reviewStatus: "unreviewed" });
    expect(suggestions[0].coordinates[0]).toBeCloseTo(94.2498342, 5);
    expect(suggestions[0].coordinates[1]).toBeCloseTo(26.7460082, 5);
  });

  it("explains a photo without a position", async () => {
    const { suggestions, issues } = await readPhotos([photo("chat.jpg", plainJpeg)]);

    expect(suggestions).toEqual([]);
    expect(issues[0]).toMatchObject({ severity: "warning", file: "ee-dept/outside/chat.jpg" });
    expect(issues[0].message).toContain("WhatsApp");
  });

  it("does not believe 0, 0", async () => {
    expect((await readPhotos([photo("zero.jpg", jpegWithGps(0, 0))])).suggestions).toEqual([]);
  });

  it("uses the same photo only once", async () => {
    const bytes = jpegWithGps(26.746, 94.2498);
    const { suggestions, issues } = await readPhotos([photo("b.jpg", bytes), photo("a.jpg", bytes)]);

    expect(suggestions.map((suggestion) => suggestion.photo)).toEqual(["a.jpg"]);
    expect(issues[0].message).toContain("ee-dept/outside/a.jpg");
  });

  it("explains files it can't use, and skips system files", async () => {
    const { issues } = await readPhotos([
      photo("clip.mp4", plainJpeg),
      photo("Thumbs.db", plainJpeg),
      photo(".DS_Store", plainJpeg),
    ]);

    expect(issues.map((issue) => issue.file)).toEqual(["ee-dept/outside/clip.mp4"]);
  });

  it("survives a file that only pretends to be a photo", async () => {
    const { suggestions, issues } = await readPhotos([photo("fake.jpg", Buffer.from("not a photo"))]);

    expect(suggestions).toEqual([]);
    expect(issues).toHaveLength(1);
  });

  it("gives the same report whatever the order of the files", async () => {
    const photos = [photo("b.jpg", jpegWithGps(26.746, 94.25)), photo("a.jpg", jpegWithGps(26.747, 94.251))];

    expect(await readPhotos(photos)).toEqual(await readPhotos([...photos].reverse()));
  });
});
