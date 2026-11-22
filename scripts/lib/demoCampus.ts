/**
 * A made-up campus for demos and tests.
 *
 * Nothing here is real. It is drawn in metres around the real centre of JEC and
 * turned into coordinates at the end. The same code always gives the same files.
 */
import { localPlane } from "../../src/lib/geo/localPlane";
import { JEC_CENTRE, type LngLat, type XY } from "../../src/lib/geo/types";
import { formatCollection, formatJson } from "./format";

const plane = localPlane(JEC_CENTRE);
const META = { source: "demo fixture", placeholder: true, reviewStatus: "unreviewed" } as const;

/** Metres east and north of the centre, as [longitude, latitude] to about a centimetre. */
function at(x: number, y: number): LngLat {
  return plane.toLngLat([x, y]).map((value) => Number(value.toFixed(7))) as LngLat;
}

const line = (points: XY[]) => ({ type: "LineString", coordinates: points.map(([x, y]) => at(x, y)) });
const point = ([x, y]: XY) => ({ type: "Point", coordinates: at(x, y) });
const closed = (points: XY[]) => ({ type: "Polygon", coordinates: [[...points, points[0]].map(([x, y]) => at(x, y))] });
const box = (west: number, south: number, east: number, north: number) =>
  closed([
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ]);
const feature = (geometry: object, properties: object) => ({ type: "Feature", properties, geometry });

// --- Campus ------------------------------------------------------------------

const boundary = feature(
  closed([
    [-230, -190],
    [190, -190],
    [240, -60],
    [230, 120],
    [120, 190],
    [-150, 200],
    [-240, 90],
  ]),
  { id: "demo-campus", name: "Demo campus", ...META },
);

const buildings = [
  feature(box(-120, 20, -40, 60), {
    id: "demo-block-a",
    name: "Demo Block A",
    shortName: "Block A",
    departments: ["Demo Department of Examples"],
    levels: [
      { ordinal: 0, name: "Ground floor" },
      { ordinal: 1, name: "Floor 1" },
    ],
    defaultLevel: 0,
    entranceIds: ["demo-block-a-main", "demo-block-a-rear"],
    ...META,
  }),
  feature(box(20, 20, 80, 60), {
    id: "demo-block-b",
    name: "Demo Block B",
    shortName: "Block B",
    departments: ["Demo Department of Samples"],
    levels: [
      { ordinal: 0, name: "Ground floor" },
      { ordinal: 1, name: "Floor 1" },
      { ordinal: 2, name: "Floor 2" },
    ],
    defaultLevel: 0,
    entranceIds: ["demo-block-b-main", "demo-block-b-east"],
    ...META,
  }),
  feature(box(96, 24, 146, 56), {
    id: "demo-library",
    name: "Demo Library",
    shortName: "Library",
    departments: [],
    levels: [
      { ordinal: -1, name: "Basement" },
      { ordinal: 0, name: "Ground floor" },
      { ordinal: 1, name: "Floor 1" },
    ],
    defaultLevel: 0,
    entranceIds: ["demo-library-west"],
    ...META,
  }),
];

const entrance = (
  position: XY,
  id: string,
  buildingId: string,
  name: string,
  outdoorNodeId: string,
  extra: object = {},
) => feature(point(position), { id, buildingId, level: 0, name, access: "public", outdoorNodeId, ...extra, ...META });

const entrances = [
  entrance([-80, 20], "demo-block-a-main", "demo-block-a", "Main entrance", "demo-n-block-a-main", {
    indoorNodeId: "demo-a0-door",
    accessibility: { stepFree: "yes", reviewStatus: "unreviewed", note: "Demo value" },
  }),
  entrance([-100, 60], "demo-block-a-rear", "demo-block-a", "Rear entrance (staff only)", "demo-n-block-a-rear", {
    access: "restricted",
  }),
  entrance([50, 20], "demo-block-b-main", "demo-block-b", "Main entrance", "demo-n-block-b-main", {
    accessibility: { stepFree: "no", reviewStatus: "unreviewed", note: "Demo value" },
  }),
  entrance([80, 40], "demo-block-b-east", "demo-block-b", "East entrance", "demo-n-block-b-east"),
  entrance([96, 40], "demo-library-west", "demo-library", "West entrance", "demo-n-library-west"),
];

const place = (position: XY, id: string, name: string, category: string, aliases: string[] = [], extra: object = {}) =>
  feature(point(position), { id, name, aliases, category, ...extra, ...META });

const places = [
  place([0, -184], "demo-main-gate", "Demo Main Gate", "gate", ["front gate"]),
  place([-17, 184], "demo-back-gate", "Demo Back Gate", "gate", ["rear gate"]),
  place([-90, -98], "demo-canteen", "Demo Canteen", "canteen", ["food", "cafe"]),
  place([112, -98], "demo-hostel", "Demo Hostel", "hostel"),
  place([-116, 122], "demo-ground", "Demo Ground", "ground", ["playground", "field"]),
  place([96, 116], "demo-parking", "Demo Parking", "parking", ["bike stand"]),
  place([8, -150], "demo-atm", "Demo ATM", "atm", ["cash machine"]),
  place([-10, -118], "demo-medical-room", "Demo Medical Room", "medical", ["first aid", "doctor"]),
  place([121, 40], "demo-reading-hall", "Demo Reading Hall", "library", ["books"], { buildingId: "demo-library" }),
  place([50, 40], "demo-admin-office", "Demo Admin Office", "admin", ["principal"], { buildingId: "demo-block-b" }),
  place([-80, 40], "demo-department", "Demo Department of Examples", "department", ["examples"], {
    buildingId: "demo-block-a",
  }),
];

// --- Paths -------------------------------------------------------------------

const NODES: Record<string, XY> = {
  "main-gate": [0, -186],
  "gate-square": [0, -150],
  "south-cross": [0, -90],
  "mid-cross": [0, -10],
  "north-cross": [0, 110],
  "back-gate": [-18, 186],
  "west-end": [-180, -10],
  "block-a-front": [-80, -10],
  "block-b-front": [50, -10],
  "gap-south": [88, -10],
  gap: [88, 40],
  "east-end": [180, -10],
  "block-a-main": [-80, 18],
  "block-a-rear": [-100, 62],
  "block-b-main": [50, 18],
  "block-b-east": [82, 40],
  "library-west": [94, 40],
  canteen: [-90, -92],
  hostel: [112, -92],
  ground: [-110, 118],
  parking: [92, 112],
};

const path = (id: string, from: string, to: string, kind: string, via: XY[] = [], access = "public") =>
  feature(line([NODES[from], ...via, NODES[to]]), {
    id: `demo-${id}`,
    fromNode: `demo-n-${from}`,
    toNode: `demo-n-${to}`,
    kind,
    access,
    direction: "both",
    layer: 0,
    evidence: "Made up for the demo",
    ...META,
  });

const paths = [
  path("gate-road", "main-gate", "gate-square", "road"),
  path("south-avenue", "gate-square", "south-cross", "road"),
  path("central-avenue", "south-cross", "mid-cross", "road"),
  path("north-avenue", "mid-cross", "north-cross", "road"),
  path("back-gate-lane", "north-cross", "back-gate", "footway", [[-6, 150]]),
  path("west-walk", "west-end", "block-a-front", "footway"),
  path("block-a-walk", "block-a-front", "mid-cross", "footway"),
  path("block-b-walk", "mid-cross", "block-b-front", "footway"),
  path("library-walk", "block-b-front", "gap-south", "footway"),
  path("east-walk", "gap-south", "east-end", "footway"),
  path("block-a-approach", "block-a-front", "block-a-main", "connector"),
  path("block-b-approach", "block-b-front", "block-b-main", "connector"),
  path("gap-lane", "gap-south", "gap", "footway"),
  path("block-b-side", "gap", "block-b-east", "connector"),
  path("library-approach", "gap", "library-west", "connector"),
  path("canteen-walk", "south-cross", "canteen", "footway", [[-40, -96]]),
  path("canteen-loop", "canteen", "west-end", "footway", [[-150, -70]]),
  path("hostel-walk", "south-cross", "hostel", "footway", [[60, -96]]),
  path("hostel-loop", "hostel", "east-end", "footway", [[165, -60]]),
  path("ground-walk", "north-cross", "ground", "footway", [[-60, 122]]),
  path("ground-loop", "ground", "west-end", "footway", [[-170, 60]]),
  path("block-a-rear-path", "ground", "block-a-rear", "footway", [[-105, 90]]),
  path("parking-walk", "north-cross", "parking", "footway", [[50, 116]]),
  path("parking-steps", "gap", "parking", "steps", [[88, 80]]),
  path("service-road", "east-end", "parking", "road", [[170, 90]], "restricted"),
];

// --- Inside Demo Block A -----------------------------------------------------

interface DemoRoom {
  id: string;
  number: string;
  name: string;
  type: string;
  /** West and east walls, in metres. */
  span: [number, number];
  side: "south" | "north";
  /** The corridor junction in front of the door. */
  node: string;
  order?: { from: string; side: "left" | "right"; index: number }[];
  near?: string;
}

const ROOMS_A: Record<number, DemoRoom[]> = {
  0: [
    { id: "a-001", number: "A-001", name: "Demo Classroom 1", type: "classroom", span: [-118, -97], side: "south", node: "w", order: [{ from: "lobby", side: "left", index: 2 }] },
    { id: "a-002", number: "A-002", name: "Demo Lab", type: "lab", span: [-97, -84], side: "south", node: "2", order: [{ from: "lobby", side: "left", index: 1 }] },
    { id: "a-003", number: "A-003", name: "Demo Office", type: "office", span: [-76, -60], side: "south", node: "stairs", near: "opposite the stairs" },
    { id: "a-004", number: "A-004", name: "Demo Staff Room", type: "staffroom", span: [-60, -42], side: "south", node: "e", near: "at the east end" },
    { id: "a-005", number: "A-005", name: "Demo Classroom 2", type: "classroom", span: [-118, -97], side: "north", node: "w", order: [{ from: "lobby", side: "right", index: 2 }] },
    { id: "a-006", number: "A-006", name: "Demo HOD Office", type: "hod", span: [-97, -76], side: "north", node: "2", order: [{ from: "lobby", side: "right", index: 1 }] },
    { id: "a-0-toilet", number: "", name: "Demo Toilet", type: "toilet", span: [-58, -42], side: "north", node: "e" },
  ],
  1: [
    { id: "a-101", number: "A-101", name: "Demo Classroom 3", type: "classroom", span: [-118, -97], side: "south", node: "w", order: [{ from: "stairs", side: "left", index: 2 }] },
    { id: "a-102", number: "A-102", name: "Demo Drawing Hall", type: "hall", span: [-97, -76], side: "south", node: "2", order: [{ from: "stairs", side: "left", index: 1 }] },
    { id: "a-103", number: "A-103", name: "Demo Seminar Room", type: "hall", span: [-76, -60], side: "south", node: "stairs", near: "opposite the stairs" },
    { id: "a-104", number: "A-104", name: "Demo Store", type: "store", span: [-60, -42], side: "south", node: "e", near: "at the east end" },
    { id: "a-105", number: "A-105", name: "Demo Computer Lab", type: "lab", span: [-118, -97], side: "north", node: "w", order: [{ from: "stairs", side: "right", index: 2 }] },
    { id: "a-106", number: "A-106", name: "Demo Faculty Room", type: "staffroom", span: [-97, -76], side: "north", node: "2", order: [{ from: "stairs", side: "right", index: 1 }] },
    { id: "a-1-toilet", number: "", name: "Demo Toilet", type: "toilet", span: [-58, -42], side: "north", node: "e" },
  ],
};

/** Corridor junctions, by name: metres east along the corridor. */
const CORRIDOR_X: [string, number][] = [
  ["w", -108],
  ["2", -90],
  ["lobby", -80],
  ["stairs", -70],
  ["lift", -62],
  ["e", -51],
];
const CORRIDOR_Y = 40;

function floorPlan(level: 0 | 1): object[] {
  const other = level === 0 ? 1 : 0;
  const node = (name: string, floor: number = level) => `demo-a${floor}-${name}`;
  const x = Object.fromEntries(CORRIDOR_X);
  const features: object[] = [];

  for (const room of ROOMS_A[level]) {
    const [south, north] = room.side === "south" ? [22, 38] : [42, 58];
    features.push(
      feature(box(room.span[0], south, room.span[1], north), { featureType: "room", roomId: `demo-${room.id}`, ...META }),
    );
  }
  for (const [kind, from, to] of [["stairs", -76, -66], ["lift", -66, -58]] as const) {
    features.push(feature(box(from, 42, to, 58), { featureType: "room", roomId: `demo-a-${level}-${kind}`, ...META }));
  }

  for (let i = 1; i < CORRIDOR_X.length; i++) {
    const [from, fromX] = CORRIDOR_X[i - 1];
    const [to, toX] = CORRIDOR_X[i];
    features.push(
      feature(line([[fromX, CORRIDOR_Y], [toX, CORRIDOR_Y]]), {
        featureType: "corridor",
        id: `demo-a${level}-corridor-${i}`,
        fromNode: node(from),
        toNode: node(to),
        access: "public",
        ...META,
      }),
    );
  }
  if (level === 0) {
    features.push(
      feature(line([[-80, 22], [-80, CORRIDOR_Y]]), {
        featureType: "corridor",
        id: "demo-a0-entrance-hall",
        fromNode: node("door"),
        toNode: node("lobby"),
        access: "public",
        ...META,
      }),
    );
  }

  for (const room of ROOMS_A[level]) {
    features.push(
      feature(point([x[room.node], room.side === "south" ? 38 : 42]), {
        featureType: "door",
        id: `demo-door-${room.id}`,
        roomId: `demo-${room.id}`,
        nodeId: node(room.node),
        ...(room.order && {
          order: room.order.map(({ from, side, index }) => ({ fromNode: node(from), side, index })),
        }),
        ...META,
      }),
    );
  }

  for (const kind of ["stairs", "lift"] as const) {
    features.push(
      feature(point([x[kind], 44]), {
        featureType: "vertical",
        id: `demo-a${level}-${kind}`,
        connectorId: `demo-a-${kind}`,
        kind,
        name: kind === "stairs" ? "Demo stairs" : "Demo lift",
        level,
        nodeId: node(kind),
        connects: [{ level: other, nodeId: node(kind, other) }],
        ...META,
      }),
    );
  }
  return features;
}

// --- Rooms -------------------------------------------------------------------

const roomsOfA = ([0, 1] as const).flatMap((level) => [
  ...ROOMS_A[level].map((room) => ({
    id: `demo-${room.id}`,
    buildingId: "demo-block-a",
    level,
    roomNumber: room.number,
    name: room.name,
    type: room.type,
    ...(room.type !== "toilet" && { department: "Demo Department of Examples" }),
    ...(room.near && { near: room.near }),
    doorId: `demo-door-${room.id}`,
    ...META,
  })),
  ...(["stairs", "lift"] as const).map((kind) => ({
    id: `demo-a-${level}-${kind}`,
    buildingId: "demo-block-a",
    level,
    roomNumber: "",
    name: kind === "stairs" ? "Demo Stairs" : "Demo Lift",
    type: kind,
    ...META,
  })),
]);

const listed = (id: string, buildingId: string, level: number, roomNumber: string, name: string, type: string, near?: string) => ({
  id: `demo-${id}`,
  buildingId,
  level,
  roomNumber,
  name,
  type,
  ...(near && { near }),
  ...META,
});

const rooms = [
  ...roomsOfA,
  listed("b-001", "demo-block-b", 0, "001", "Demo Reception", "office", "just inside the main entrance"),
  listed("b-002", "demo-block-b", 0, "002", "Demo Admin Counter", "office", "past the reception, on the left"),
  listed("b-101", "demo-block-b", 1, "101", "Demo Lecture Hall", "hall", "top of the main stairs"),
  listed("b-102a", "demo-block-b", 1, "102A", "Demo Physics Lab", "lab", "east end of the corridor"),
  listed("b-201", "demo-block-b", 2, "201", "Demo Classroom 4", "classroom", "top of the main stairs"),
  listed("b-2-toilet", "demo-block-b", 2, "", "Demo Toilet", "toilet", "next to the stairs"),
  listed("l-b1", "demo-library", -1, "B1", "Demo Archive", "store", "down the stairs, straight ahead"),
  listed("l-01", "demo-library", 0, "L01", "Demo Issue Desk", "office", "opposite the west entrance"),
  listed("l-11", "demo-library", 1, "L11", "Demo Quiet Room", "other", "top of the stairs, on the right"),
];

// --- Files -------------------------------------------------------------------

const manifest = {
  schemaVersion: 1,
  datasetVersion: "demo-1",
  mode: "demo",
  title: "Demo campus",
  provenance: "Made up by scripts/make-demo-data.ts. Nothing in it is real.",
  reviewStatus: "unreviewed",
  attribution: ["Demo data: made up, not a real map"],
  files: {
    boundary: "campus-boundary.geojson",
    buildings: "buildings.geojson",
    entrances: "entrances.geojson",
    places: "places.geojson",
    paths: "campus-paths.geojson",
    rooms: "rooms.json",
    levels: [
      { buildingId: "demo-block-a", level: 0, path: "buildings/demo-block-a/level-0.geojson" },
      { buildingId: "demo-block-a", level: 1, path: "buildings/demo-block-a/level-1.geojson" },
    ],
  },
};

/** Every file of the demo dataset: path to content. */
export function demoDatasetFiles(): Record<string, string> {
  return {
    "dataset-manifest.json": formatJson(manifest),
    "campus-boundary.geojson": formatCollection([boundary]),
    "buildings.geojson": formatCollection(buildings),
    "entrances.geojson": formatCollection(entrances),
    "places.geojson": formatCollection(places),
    "campus-paths.geojson": formatCollection(paths),
    "rooms.json": formatJson(rooms),
    "buildings/demo-block-a/level-0.geojson": formatCollection(floorPlan(0)),
    "buildings/demo-block-a/level-1.geojson": formatCollection(floorPlan(1)),
  };
}
