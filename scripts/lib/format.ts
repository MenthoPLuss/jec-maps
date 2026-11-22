/** Readable, stable JSON: the same data always gives the same text. */

export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** One feature per line, so a change to one feature is a one-line diff. */
export function formatCollection(features: unknown[], extra: Record<string, unknown> = {}): string {
  const head = Object.entries(extra).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},\n`);
  if (features.length === 0) {
    return `{\n  "type": "FeatureCollection",\n${head.join("")}  "features": []\n}\n`;
  }
  const lines = features.map((feature) => `    ${JSON.stringify(feature)}`);
  return `{\n  "type": "FeatureCollection",\n${head.join("")}  "features": [\n${lines.join(",\n")}\n  ]\n}\n`;
}
