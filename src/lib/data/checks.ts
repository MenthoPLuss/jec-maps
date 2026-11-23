/** Cross-checks between records: references, duplicates and topology. */
import { containsPoint, distanceToAreaM, ringsOf, type AreaGeometry } from "../geo/area";
import { distanceM } from "../geo/distance";
import { localPlane, segmentIntersection } from "../geo/localPlane";
import { nearestOnPolyline, polylineCrossings, polylineLengthM } from "../geo/polyline";
import { JEC_CENTRE, type LngLat } from "../geo/types";
import { ENTRANCE_TOLERANCE_M, MANIFEST_FILE } from "./constants";
import type { Dataset, Issue, LevelPlan } from "./parse";
import type { CorridorFeature, DoorFeature, LevelFeature, RoomShapeFeature, VerticalFeature } from "./schemas";

/** Campus data further away than this is a mistake, most often swapped coordinates. */
const MAX_FROM_CENTRE_M = 5_000;
/** A junction must be at the same spot in every path that uses it. */
const NODE_TOLERANCE_M = 0.5;
const MIN_PATH_M = 0.5;
/** Path ends closer than this to another path probably should be joined to it. */
const NEAR_MISS_M = 2;

type Report = (
  severity: Issue["severity"],
  file: string,
  record: string,
  field: string,
  message: string,
) => void;

export function checkDataset(dataset: Dataset): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (severity, file, record, field, message) => {
    issues.push({ severity, file, record, field, message });
  };

  checkIds(dataset, report);
  checkPositions(dataset, report);
  checkAreas(dataset, report);
  checkMode(dataset, report);
  const outdoorNodes = checkPaths(dataset, report);
  checkBuildings(dataset, report);
  checkEntrances(dataset, outdoorNodes, report);
  checkPlaces(dataset, report);
  checkRooms(dataset, report);
  checkLevels(dataset, report);

  return issues;
}

// --- Ids ---------------------------------------------------------------------

function checkIds(dataset: Dataset, report: Report): void {
  const { files } = dataset.manifest;
  const unique = (file: string, ids: string[]) => {
    for (const id of duplicates(ids)) report("error", file, id, "id", "this id is used more than once");
  };

  unique(files.buildings, dataset.buildings.map((building) => building.properties.id));
  unique(files.entrances, dataset.entrances.map((entrance) => entrance.properties.id));
  unique(files.places, dataset.places.map((place) => place.properties.id));
  unique(files.paths, dataset.paths.map((path) => path.properties.id));
  unique(files.rooms, dataset.rooms.map((room) => room.id));

  const plans = new Map<string, string[]>();
  for (const plan of dataset.levels) {
    const ids = plans.get(plan.buildingId) ?? [];
    for (const feature of plan.features) {
      if (feature.properties.featureType !== "room") ids.push(feature.properties.id);
    }
    plans.set(plan.buildingId, ids);
  }
  for (const [buildingId, ids] of plans) unique(`floor plans of ${buildingId}`, ids);
}

// --- Positions and shapes ----------------------------------------------------

function checkPositions(dataset: Dataset, report: Report): void {
  for (const { file, record, positions } of allGeometries(dataset)) {
    const far = positions.find((position) => distanceM(position, JEC_CENTRE) > MAX_FROM_CENTRE_M);
    if (far) {
      const km = Math.round(distanceM(far, JEC_CENTRE) / 1000);
      report(
        "error",
        file,
        record,
        "geometry.coordinates",
        `[${far.join(", ")}] is ${km} km from the campus. Positions are [longitude, latitude]: are they swapped?`,
      );
    }
  }
}

function checkAreas(dataset: Dataset, report: Report): void {
  const { files } = dataset.manifest;
  const areas: { file: string; record: string; area: AreaGeometry }[] = dataset.buildings.map((building) => ({
    file: files.buildings,
    record: building.properties.id,
    area: building.geometry,
  }));
  if (dataset.boundary) {
    areas.push({ file: files.boundary, record: dataset.boundary.properties.id, area: dataset.boundary.geometry });
  }

  for (const { file, record, area } of areas) {
    if (ringsOf(area).some(crossesItself)) {
      report("error", file, record, "geometry.coordinates", "the outline crosses itself");
    }
  }

  const boundary = dataset.boundary;
  if (boundary) {
    for (const building of dataset.buildings) {
      if (!ringsOf(building.geometry)[0].some((corner) => containsPoint(boundary.geometry, corner))) {
        report("warning", files.buildings, building.properties.id, "geometry", "lies outside the campus boundary");
      }
    }
  }
}

function checkMode(dataset: Dataset, report: Report): void {
  const { mode, files } = dataset.manifest;
  if (mode === "live") return;

  const demand = (file: string, record: string, placeholder: boolean) => {
    if (!placeholder) {
      report("error", file, record, "placeholder", "a demo dataset may only hold placeholders");
    }
  };
  if (dataset.boundary) demand(files.boundary, dataset.boundary.properties.id, dataset.boundary.properties.placeholder);
  for (const { properties } of dataset.buildings) demand(files.buildings, properties.id, properties.placeholder);
  for (const { properties } of dataset.entrances) demand(files.entrances, properties.id, properties.placeholder);
  for (const { properties } of dataset.places) demand(files.places, properties.id, properties.placeholder);
  for (const { properties } of dataset.paths) demand(files.paths, properties.id, properties.placeholder);
  for (const room of dataset.rooms) demand(files.rooms, room.id, room.placeholder);
  for (const plan of dataset.levels) {
    for (const feature of plan.features) demand(plan.file, featureName(feature), feature.properties.placeholder);
  }
}

// --- Paths -------------------------------------------------------------------

/** Checks the path network and returns where each junction is. */
function checkPaths(dataset: Dataset, report: Report): Map<string, LngLat> {
  const file = dataset.manifest.files.paths;
  const nodes = new Map<string, LngLat>();

  for (const { properties, geometry } of dataset.paths) {
    if (polylineLengthM(geometry.coordinates) < MIN_PATH_M) {
      report("error", file, properties.id, "geometry.coordinates", "the path has no length");
    }
    checkNode(nodes, properties.fromNode, geometry.coordinates[0], file, properties.id, "fromNode", report);
    checkNode(nodes, properties.toNode, lastOf(geometry.coordinates), file, properties.id, "toNode", report);
  }

  for (let i = 0; i < dataset.paths.length; i++) {
    for (let j = i + 1; j < dataset.paths.length; j++) {
      const a = dataset.paths[i];
      const b = dataset.paths[j];
      if (a.properties.layer !== b.properties.layer) continue;

      const ends = [a.properties.fromNode, a.properties.toNode];
      const shared = [b.properties.fromNode, b.properties.toNode].filter((node) => ends.includes(node));
      const atSharedJunction = (position: LngLat) =>
        shared.some((node) => distanceM(position, nodes.get(node) as LngLat) < NODE_TOLERANCE_M);

      if (polylineCrossings(a.geometry.coordinates, b.geometry.coordinates).some((hit) => !atSharedJunction(hit))) {
        report(
          "warning",
          file,
          a.properties.id,
          "geometry.coordinates",
          `crosses ${b.properties.id} without a shared junction. If people can turn here, split both paths and give them the same junction`,
        );
      } else if (shared.length === 0) {
        reportNearMiss(a, b, file, report);
      }
    }
  }

  return nodes;
}

function reportNearMiss(
  a: Dataset["paths"][number],
  b: Dataset["paths"][number],
  file: string,
  report: Report,
): void {
  const ends: [string, LngLat, Dataset["paths"][number]][] = [
    [a.properties.id, a.geometry.coordinates[0], b],
    [a.properties.id, lastOf(a.geometry.coordinates), b],
    [b.properties.id, b.geometry.coordinates[0], a],
    [b.properties.id, lastOf(b.geometry.coordinates), a],
  ];
  for (const [id, end, other] of ends) {
    const gap = nearestOnPolyline(other.geometry.coordinates, end)?.distanceM ?? Infinity;
    if (gap < NEAR_MISS_M) {
      report(
        "warning",
        file,
        id,
        "geometry.coordinates",
        `ends ${gap.toFixed(1)} m from ${other.properties.id} but is not joined to it`,
      );
      return;
    }
  }
}

function checkNode(
  nodes: Map<string, LngLat>,
  node: string,
  position: LngLat,
  file: string,
  record: string,
  field: string,
  report: Report,
): void {
  const known = nodes.get(node);
  if (!known) {
    nodes.set(node, position);
    return;
  }
  const gap = distanceM(known, position);
  if (gap > NODE_TOLERANCE_M) {
    report("error", file, record, field, `junction ${node} is ${gap.toFixed(1)} m away from where another line puts it`);
  }
}

// --- Buildings, entrances, places, rooms -------------------------------------

function checkBuildings(dataset: Dataset, report: Report): void {
  const file = dataset.manifest.files.buildings;
  for (const { properties } of dataset.buildings) {
    for (const entranceId of properties.entranceIds) {
      const entrance = dataset.entrances.find((candidate) => candidate.properties.id === entranceId);
      if (!entrance) {
        report("error", file, properties.id, "entranceIds", `there is no entrance ${entranceId}`);
      } else if (entrance.properties.buildingId !== properties.id) {
        report("error", file, properties.id, "entranceIds", `${entranceId} belongs to ${entrance.properties.buildingId}`);
      }
    }
  }
}

function checkEntrances(dataset: Dataset, outdoorNodes: Map<string, LngLat>, report: Report): void {
  const file = dataset.manifest.files.entrances;

  for (const { properties, geometry } of dataset.entrances) {
    const building = dataset.buildings.find((candidate) => candidate.properties.id === properties.buildingId);
    if (!building) {
      report("error", file, properties.id, "buildingId", `there is no building ${properties.buildingId}`);
      continue;
    }
    if (!building.properties.entranceIds.includes(properties.id)) {
      report("error", file, properties.id, "buildingId", `${properties.buildingId} does not list this entrance`);
    }
    if (!hasLevel(dataset, properties.buildingId, properties.level)) {
      report("error", file, properties.id, "level", `${properties.buildingId} has no level ${properties.level}`);
    }

    const node = outdoorNodes.get(properties.outdoorNodeId);
    if (!node) {
      report("error", file, properties.id, "outdoorNodeId", `no path has a junction ${properties.outdoorNodeId}`);
    } else if (distanceM(node, geometry.coordinates) > ENTRANCE_TOLERANCE_M) {
      const gap = Math.round(distanceM(node, geometry.coordinates));
      report("warning", file, properties.id, "outdoorNodeId", `the junction is ${gap} m from the entrance`);
    }

    const toWall = distanceToOutlineM(building.geometry, geometry.coordinates);
    if (toWall > ENTRANCE_TOLERANCE_M) {
      report("warning", file, properties.id, "geometry", `the entrance is ${Math.round(toWall)} m from the outline of its building`);
    }

    if (properties.indoorNodeId !== undefined) {
      const plan = planOf(dataset, properties.buildingId, properties.level);
      if (!plan) {
        report("error", file, properties.id, "indoorNodeId", `level ${properties.level} has no floor plan`);
      } else if (!corridorNodes(plan).has(properties.indoorNodeId)) {
        report("error", file, properties.id, "indoorNodeId", `${plan.file} has no corridor junction ${properties.indoorNodeId}`);
      }
    }
  }
}

function checkPlaces(dataset: Dataset, report: Report): void {
  const file = dataset.manifest.files.places;
  for (const { properties } of dataset.places) {
    if (properties.buildingId !== undefined && !hasBuilding(dataset, properties.buildingId)) {
      report("error", file, properties.id, "buildingId", `there is no building ${properties.buildingId}`);
    }
    for (const entranceId of properties.entranceIds ?? []) {
      const entrance = dataset.entrances.find((candidate) => candidate.properties.id === entranceId);
      if (!entrance) {
        report("error", file, properties.id, "entranceIds", `there is no entrance ${entranceId}`);
      } else if (entrance.properties.buildingId !== properties.buildingId) {
        report("error", file, properties.id, "entranceIds", `${entranceId} belongs to another building`);
      }
    }
  }

  for (const name of duplicates(dataset.places.map((place) => place.properties.name.toLowerCase()))) {
    report("warning", file, name, "name", "two places have this name");
  }
}

function checkRooms(dataset: Dataset, report: Report): void {
  const file = dataset.manifest.files.rooms;

  for (const room of dataset.rooms) {
    if (!hasBuilding(dataset, room.buildingId)) {
      report("error", file, room.id, "buildingId", `there is no building ${room.buildingId}`);
      continue;
    }
    if (!hasLevel(dataset, room.buildingId, room.level)) {
      report("error", file, room.id, "level", `${room.buildingId} has no level ${room.level}`);
    }
    if (room.doorId !== undefined) {
      const plan = planOf(dataset, room.buildingId, room.level);
      const door = plan && doorsOf(plan).find((candidate) => candidate.properties.id === room.doorId);
      if (!plan) report("error", file, room.id, "doorId", `level ${room.level} has no floor plan`);
      else if (!door) report("error", file, room.id, "doorId", `${plan.file} has no door ${room.doorId}`);
      else if (door.properties.roomId !== room.id) {
        report("error", file, room.id, "doorId", `${room.doorId} is the door of ${door.properties.roomId}`);
      }
    }
  }

  const numbered = dataset.rooms.filter((room) => room.roomNumber !== "");
  for (const key of duplicates(numbered.map((room) => `${room.buildingId} ${room.roomNumber.toLowerCase()}`))) {
    report("error", file, key, "roomNumber", "two rooms of the same building have this number");
  }
}

// --- Floor plans -------------------------------------------------------------

function checkLevels(dataset: Dataset, report: Report): void {
  const { files } = dataset.manifest;

  for (const key of duplicates(dataset.levels.map((plan) => `${plan.buildingId} level ${plan.level}`))) {
    report("error", MANIFEST_FILE, key, "files.levels", "this floor is listed twice");
  }

  const nodeLevels = new Map<string, number>();
  for (const plan of dataset.levels) {
    if (!hasBuilding(dataset, plan.buildingId)) {
      report("error", plan.file, "file", "", `there is no building ${plan.buildingId}`);
      continue;
    }
    if (!hasLevel(dataset, plan.buildingId, plan.level)) {
      report("error", plan.file, "file", "", `${plan.buildingId} has no level ${plan.level}`);
    }

    const nodes = new Map<string, LngLat>();
    for (const { properties, geometry } of corridorsOf(plan)) {
      if (polylineLengthM(geometry.coordinates) < MIN_PATH_M) {
        report("error", plan.file, properties.id, "geometry.coordinates", "the corridor has no length");
      }
      checkNode(nodes, properties.fromNode, geometry.coordinates[0], plan.file, properties.id, "fromNode", report);
      checkNode(nodes, properties.toNode, lastOf(geometry.coordinates), plan.file, properties.id, "toNode", report);
    }
    for (const node of nodes.keys()) {
      const key = `${plan.buildingId} ${node}`;
      const other = nodeLevels.get(key);
      if (other !== undefined && other !== plan.level) {
        report("error", plan.file, node, "", `junction ${node} is also used on level ${other}: each floor needs its own junctions`);
      }
      nodeLevels.set(key, plan.level);
    }

    const needsNode = (record: string, field: string, node: string) => {
      if (!nodes.has(node)) report("error", plan.file, record, field, `this floor has no corridor junction ${node}`);
    };

    const shapes = plan.features.filter((feature): feature is RoomShapeFeature => feature.properties.featureType === "room");
    for (const { properties } of [...shapes, ...doorsOf(plan)]) {
      const room = dataset.rooms.find((candidate) => candidate.id === properties.roomId);
      if (!room) {
        report("error", plan.file, properties.roomId, "roomId", `${files.rooms} has no room ${properties.roomId}`);
      } else if (room.buildingId !== plan.buildingId || room.level !== plan.level) {
        report("error", plan.file, properties.roomId, "roomId", `${files.rooms} puts this room on level ${room.level} of ${room.buildingId}`);
      }
    }
    for (const roomId of duplicates(shapes.map((shape) => shape.properties.roomId))) {
      report("warning", plan.file, roomId, "roomId", "this room is drawn twice");
    }

    for (const { properties } of doorsOf(plan)) {
      needsNode(properties.id, "nodeId", properties.nodeId);
      for (const order of properties.order ?? []) needsNode(properties.id, "order.fromNode", order.fromNode);
    }

    for (const { properties } of verticalsOf(plan)) {
      if (properties.level !== plan.level) {
        report("error", plan.file, properties.id, "level", `says level ${properties.level}, but this file is level ${plan.level}`);
      }
      needsNode(properties.id, "nodeId", properties.nodeId);
      checkConnections(dataset, plan, properties, report);
    }
  }
}

function checkConnections(
  dataset: Dataset,
  plan: LevelPlan,
  connector: VerticalFeature["properties"],
  report: Report,
): void {
  for (const target of connector.connects) {
    const field = "connects";
    if (target.level === connector.level) {
      report("error", plan.file, connector.id, field, "connects a floor with itself");
      continue;
    }
    const other = planOf(dataset, plan.buildingId, target.level);
    if (!other) {
      report("error", plan.file, connector.id, field, `level ${target.level} has no floor plan`);
      continue;
    }
    const landing = verticalsOf(other).find(
      ({ properties }) => properties.connectorId === connector.connectorId && properties.nodeId === target.nodeId,
    );
    if (!landing) {
      report("error", plan.file, connector.id, field, `${other.file} has no ${connector.connectorId} at junction ${target.nodeId}`);
    } else if (landing.properties.kind !== connector.kind) {
      report("error", plan.file, connector.id, "kind", `is ${connector.kind} here, but ${landing.properties.kind} on level ${target.level}`);
    }
  }
}

// --- Helpers -----------------------------------------------------------------

function hasBuilding(dataset: Dataset, buildingId: string): boolean {
  return dataset.buildings.some((building) => building.properties.id === buildingId);
}

function hasLevel(dataset: Dataset, buildingId: string, level: number): boolean {
  const building = dataset.buildings.find((candidate) => candidate.properties.id === buildingId);
  return building?.properties.levels.some((entry) => entry.ordinal === level) ?? false;
}

function planOf(dataset: Dataset, buildingId: string, level: number): LevelPlan | undefined {
  return dataset.levels.find((plan) => plan.buildingId === buildingId && plan.level === level);
}

function corridorsOf(plan: LevelPlan): CorridorFeature[] {
  return plan.features.filter((feature): feature is CorridorFeature => feature.properties.featureType === "corridor");
}

function doorsOf(plan: LevelPlan): DoorFeature[] {
  return plan.features.filter((feature): feature is DoorFeature => feature.properties.featureType === "door");
}

function verticalsOf(plan: LevelPlan): VerticalFeature[] {
  return plan.features.filter((feature): feature is VerticalFeature => feature.properties.featureType === "vertical");
}

function corridorNodes(plan: LevelPlan): Set<string> {
  return new Set(corridorsOf(plan).flatMap(({ properties }) => [properties.fromNode, properties.toNode]));
}

function featureName(feature: LevelFeature): string {
  return feature.properties.featureType === "room" ? feature.properties.roomId : feature.properties.id;
}

function distanceToOutlineM(area: AreaGeometry, position: LngLat): number {
  // A door may be drawn slightly inside the wall, so measure from both sides.
  const outside = distanceToAreaM(area, position);
  if (outside > 0) return outside;
  return Math.min(
    ...ringsOf(area).map((outline) => nearestOnPolyline(outline, position)?.distanceM ?? Infinity),
  );
}

function crossesItself(ring: LngLat[]): boolean {
  const plane = localPlane(ring[0]);
  const points = ring.map(plane.toXY);
  const last = points.length - 1;

  for (let i = 1; i <= last; i++) {
    for (let j = i + 2; j <= last; j++) {
      if (i === 1 && j === last) continue; // the first and last edges meet at the start
      if (segmentIntersection(points[i - 1], points[i], points[j - 1], points[j])) return true;
    }
  }
  return false;
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) twice.add(value);
    seen.add(value);
  }
  return [...twice];
}

function lastOf<T>(list: T[]): T {
  return list[list.length - 1];
}

function allGeometries(dataset: Dataset): { file: string; record: string; positions: LngLat[] }[] {
  const { files } = dataset.manifest;
  const result: { file: string; record: string; positions: LngLat[] }[] = [];

  if (dataset.boundary) {
    const { properties, geometry } = dataset.boundary;
    result.push({ file: files.boundary, record: properties.id, positions: ringsOf(geometry).flat() });
  }
  for (const { properties, geometry } of dataset.buildings) {
    result.push({ file: files.buildings, record: properties.id, positions: ringsOf(geometry).flat() });
  }
  for (const { properties, geometry } of dataset.entrances) {
    result.push({ file: files.entrances, record: properties.id, positions: [geometry.coordinates] });
  }
  for (const { properties, geometry } of dataset.places) {
    result.push({ file: files.places, record: properties.id, positions: [geometry.coordinates] });
  }
  for (const { properties, geometry } of dataset.paths) {
    result.push({ file: files.paths, record: properties.id, positions: geometry.coordinates });
  }
  for (const plan of dataset.levels) {
    for (const feature of plan.features) {
      result.push({ file: plan.file, record: featureName(feature), positions: positionsOf(feature) });
    }
  }
  return result;
}

function positionsOf(feature: LevelFeature): LngLat[] {
  const { geometry } = feature;
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "LineString":
      return geometry.coordinates;
    default:
      return ringsOf(geometry).flat();
  }
}
