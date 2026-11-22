// npm run icons
// Draws the app icons from src/app/icon.svg, with the browser that Playwright installed.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const svg = readFileSync(path.join("src", "app", "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

/** `safe` shrinks the drawing: phones cut maskable icons into circles. */
async function draw(size, { safe = 1, round = true } = {}) {
  const art = svg.replace("<svg ", `<svg width="${size * safe}" height="${size * safe}" `);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;` +
      `background:${round ? "transparent" : "#1d4ed8"}">${art}</body>`,
  );
  return page.screenshot({ omitBackground: true });
}

/** An .ico file is a small table in front of PNG files. */
function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ png, size }, i) => {
    const entry = 6 + i * 16;
    head.writeUInt8(size, entry);
    head.writeUInt8(size, entry + 1);
    head.writeUInt16LE(1, entry + 4);
    head.writeUInt16LE(32, entry + 6);
    head.writeUInt32LE(png.length, entry + 8);
    head.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(({ png }) => png)]);
}

const icons = path.join("public", "icons");
mkdirSync(icons, { recursive: true });
writeFileSync(path.join(icons, "icon-192.png"), await draw(192));
writeFileSync(path.join(icons, "icon-512.png"), await draw(512));
writeFileSync(path.join(icons, "icon-maskable-512.png"), await draw(512, { safe: 0.8, round: false }));
writeFileSync(path.join("src", "app", "apple-icon.png"), await draw(180, { safe: 0.9, round: false }));
writeFileSync(
  path.join("src", "app", "favicon.ico"),
  ico([
    { size: 32, png: await draw(32) },
    { size: 48, png: await draw(48) },
  ]),
);
await browser.close();
console.log("Icons written.");
