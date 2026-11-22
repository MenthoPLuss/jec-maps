/**
 * Turns recorded walks (GPX) into path candidates.
 *
 * Candidates are drawings for a person to check. They have no junctions and unknown
 * access, so nothing can ever be routed over them as they are. Times are dropped.
 */
import { gpx } from "@tmcw/togeojson";
import { DOMParser } from "@xmldom/xmldom";

import type { Issue } from "../../src/lib/data/parse";
import { toKebabId } from "../../src/lib/data/ids";
import { polylineLengthM } from "../../src/lib/geo/polyline";
import { localPlane, projectOnSegment } from "../../src/lib/geo/localPlane";
import { isLngLat, type LngLat } from "../../src/lib/geo/types";

/** Wiggles smaller than this are GPS noise. */
const SIMPLIFY_M = 2;
const MIN_LENGTH_M = 5;

export interface PathCandidate {
  type: "Feature";
  properties: {
    id: string;
    candidate: true;
    source: string;
    placeholder: false;
    reviewStatus: "unreviewed";
    access: "unknown";
    evidence: string;
    /** To be filled in by the reviewer. */
    fromNode: "";
    toNode: "";
  };
  geometry: { type: "LineString"; coordinates: LngLat[] };
}

export function importGpx(xml: string, file: string): { candidates: PathCandidate[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const report = (severity: Issue["severity"], record: string, message: string) =>
    issues.push({ severity, file, record, field: "", message });

  let problem = "";
  let collection: ReturnType<typeof gpx> | null = null;
  try {
    const parser = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") problem ||= message;
      },
    });
    collection = gpx(parser.parseFromString(xml.replace(/^﻿/, ""), "text/xml"));
  } catch (error) {
    problem ||= error instanceof Error ? error.message : String(error);
  }
  if (problem || !collection) {
    report("error", "file", `is not a readable GPX file (${problem.split("\n")[0]})`);
    return { candidates: [], issues };
  }

  const lines = collection.features.flatMap(({ geometry }) => {
    if (geometry?.type === "LineString") return [geometry.coordinates];
    if (geometry?.type === "MultiLineString") return geometry.coordinates;
    return [];
  });
  if (lines.length === 0) report("warning", "file", "has no recorded track");

  const name = toKebabId(file.replace(/\.gpx$/i, "")) || "track";
  const candidates = lines.flatMap((line, index): PathCandidate[] => {
    const record = `track ${index + 1}`;
    // Drop the altitude, points that make no sense, and repeated points.
    const points = line.map(([lng, lat]) => [lng, lat] as LngLat).filter((point) => isLngLat(point));
    if (points.length < line.length) report("warning", record, `${line.length - points.length} unusable point(s) left out`);

    const coordinates = simplify(points, SIMPLIFY_M).map(([lng, lat]): LngLat => [round(lng), round(lat)]);
    if (coordinates.length < 2 || polylineLengthM(coordinates) < MIN_LENGTH_M) {
      report("warning", record, `is shorter than ${MIN_LENGTH_M} m, so it was left out`);
      return [];
    }
    return [
      {
        type: "Feature",
        properties: {
          id: `gpx-${name}-${index + 1}`,
          candidate: true,
          source: `gpx ${file}`,
          placeholder: false,
          reviewStatus: "unreviewed",
          access: "unknown",
          evidence: `Walked and recorded in ${file}`,
          fromNode: "",
          toNode: "",
        },
        geometry: { type: "LineString", coordinates },
      },
    ];
  });

  return { candidates, issues };
}

/** Douglas-Peucker: keeps the shape within `toleranceM`. Both ends always stay. */
export function simplify(line: LngLat[], toleranceM: number): LngLat[] {
  if (line.length < 3) return line.filter((point, i) => i === 0 || !same(point, line[i - 1]));

  const plane = localPlane(line[0]);
  const points = line.map(plane.toXY);
  const keep = new Set([0, line.length - 1]);
  const open: [number, number][] = [[0, line.length - 1]];

  while (open.length > 0) {
    const [from, to] = open.pop() as [number, number];
    let worst = -1;
    let worstM = toleranceM;
    for (let i = from + 1; i < to; i++) {
      const { distanceM } = projectOnSegment(points[i], points[from], points[to]);
      if (distanceM > worstM) {
        worst = i;
        worstM = distanceM;
      }
    }
    if (worst > 0) {
      keep.add(worst);
      open.push([from, worst], [worst, to]);
    }
  }

  return line.filter((_, i) => keep.has(i));
}

const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1];
const round = (value: number) => Number(value.toFixed(7));
