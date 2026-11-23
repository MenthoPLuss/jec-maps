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

function differences(approved: object, candidate: object): string[] {
  const left = flat(approved);
  const right = flat(candidate);
  // OpenStreetMap knows no entrances: an empty list says nothing about the approved one.
  const unknown = (key: string) => key === "entranceIds" && Array.isArray(right[key]) && right[key].length === 0;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => !REVIEW_FIELDS.has(key) && !unknown(key) && JSON.stringify(left[key]) !== JSON.stringify(right[key]))
    .sort();
}

/**
 * An approved entrance has to be listed by its building. This is the one change that
 * approving makes to a record that was approved before: it only ever adds the id.
 */
export function linkEntrances<T extends object>(buildings: T[], entrances: object[]): { buildings: T[]; linked: string[] } {
  const linked: string[] = [];
  const result = buildings.map((building) => {
    const facts = (building as AnyRecord).properties;
    if (!facts) return building;
    const listed = Array.isArray(facts.entranceIds) ? (facts.entranceIds as string[]) : [];
    const added = entrances
      .map((entrance) => (entrance as AnyRecord).properties)
      .filter((entrance) => entrance?.buildingId === facts.id && !listed.includes(entrance.id))
      .map((entrance) => entrance?.id as string);
    if (added.length === 0) return building;
    linked.push(...added.map((id) => `${facts.id} now lists ${id}`));
    return { ...building, properties: { ...facts, entranceIds: [...listed, ...added] } };
  });
  return { buildings: result, linked };
}

function flat(record: object): Record<string, unknown> {
  const { properties, geometry, type, ...rest } = record as AnyRecord;
  // A room's own "type" is data; a GeoJSON feature's "type" is not.
  return properties ? { ...properties, geometry } : { ...rest, type };
}
