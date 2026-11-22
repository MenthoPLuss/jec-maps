/** Adds reviewed candidates to approved records, without ever changing what is approved. */

interface AnyRecord {
  id?: string;
  osmId?: string;
  properties?: { id: string; osmId?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface MergeResult<T> {
  merged: T[];
  added: string[];
  unchanged: string[];
  /** Already approved, but different: the approved record stays as it is. */
  conflicts: { id: string; fields: string[] }[];
}

/** Differences that don't matter: they describe the review, not the thing. */
const REVIEW_FIELDS = new Set(["reviewStatus", "reviewedBy", "reviewedOn"]);

export function mergeApproved<T extends object>(approved: T[], candidates: T[]): MergeResult<T> {
  const result: MergeResult<T> = { merged: [...approved], added: [], unchanged: [], conflicts: [] };

  for (const candidate of candidates) {
    const { id, osmId } = identity(candidate);
    const existing = approved.find((record) => {
      const known = identity(record);
      // One OpenStreetMap way becomes several paths, so there the id decides.
      return known.id === id || (osmId !== undefined && known.osmId === osmId && !isPath(record));
    });

    if (existing === undefined) {
      result.merged.push(candidate);
      result.added.push(id);
      continue;
    }
    const fields = differences(existing, candidate);
    if (fields.length === 0) result.unchanged.push(id);
    else result.conflicts.push({ id: identity(existing).id, fields });
  }

  return result;
}

function identity(record: object): { id: string; osmId?: string } {
  const value = record as AnyRecord;
  return { id: value.properties?.id ?? value.id ?? "", osmId: value.properties?.osmId ?? value.osmId };
}

function isPath(record: object): boolean {
  return (record as { geometry?: { type?: string } }).geometry?.type === "LineString";
}

function differences(a: object, b: object): string[] {
  const left = flat(a);
  const right = flat(b);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !REVIEW_FIELDS.has(key) && JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

function flat(record: object): Record<string, unknown> {
  const { properties, geometry, type, ...rest } = record as AnyRecord;
  // A room's own "type" is data; a GeoJSON feature's "type" is not.
  return properties ? { ...properties, geometry } : { ...rest, type };
}
