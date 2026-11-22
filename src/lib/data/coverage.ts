/** Decides which paths may be used for routes, and whether a real person may be guided. */
import { polylineLengthM } from "../geo/polyline";
import type { Dataset, Issue } from "./parse";
import type { PathFeature } from "./schemas";

export interface Coverage {
  /** The connected, usable paths. Everything else stays visible but is never routed over. */
  routablePathIds: string[];
  live: {
    /** True only for reviewed, real data: a boundary and connected paths. */
    available: boolean;
    /** Why not, in words for the user. */
    reasons: string[];
  };
  /** What was left out, and why. */
  issues: Issue[];
}

/** A record counts for real guidance only when a person has checked it and it isn't made up. */
export function isTrusted(record: { placeholder: boolean; reviewStatus: string }): boolean {
  return record.reviewStatus === "reviewed" && !record.placeholder;
}

export function coverageOf(dataset: Dataset): Coverage {
  const live = dataset.manifest.mode === "live";
  const file = dataset.manifest.files.paths;
  const issues: Issue[] = [];

  const usable = dataset.paths.filter((path) => {
    const { access, reviewStatus } = path.properties;
    if (reviewStatus === "rejected" || access === "private" || access === "restricted") return false;
    if (!live) return access === "public";
    if (!isTrusted(path.properties)) {
      issues.push(leftOut(file, path, "has not been reviewed"));
      return false;
    }
    if (access === "unknown") {
      issues.push(leftOut(file, path, "has unknown access"));
      return false;
    }
    return true;
  });

  const [main, ...islands] = connectedGroups(usable);
  for (const island of islands) {
    for (const path of island) issues.push(leftOut(file, path, "is not connected to the main network"));
  }

  const reasons: string[] = [];
  if (!live) {
    reasons.push("The campus data is a made-up demo.");
  } else {
    if (!dataset.boundary) reasons.push("There is no campus boundary yet.");
    else if (!isTrusted(dataset.boundary.properties)) reasons.push("The campus boundary has not been reviewed yet.");
    if (!main) reasons.push("There are no reviewed walking paths yet.");
  }

  return {
    routablePathIds: (main ?? []).map((path) => path.properties.id).sort(),
    live: { available: reasons.length === 0, reasons },
    issues,
  };
}

/** Groups paths that can be reached from each other, the longest network first. */
export function connectedGroups(paths: PathFeature[]): PathFeature[][] {
  const parent = new Map<string, string>();
  const find = (node: string): string => {
    let root = node;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(node, root);
    return root;
  };

  for (const { properties } of paths) {
    for (const node of [properties.fromNode, properties.toNode]) {
      if (!parent.has(node)) parent.set(node, node);
    }
    parent.set(find(properties.fromNode), find(properties.toNode));
  }

  const groups = new Map<string, PathFeature[]>();
  for (const path of paths) {
    const root = find(path.properties.fromNode);
    const group = groups.get(root);
    if (group) group.push(path);
    else groups.set(root, [path]);
  }

  const lengthOf = (group: PathFeature[]) =>
    group.reduce((sum, path) => sum + polylineLengthM(path.geometry.coordinates), 0);
  return [...groups.values()].sort((a, b) => lengthOf(b) - lengthOf(a));
}

function leftOut(file: string, path: PathFeature, reason: string): Issue {
  return {
    severity: "warning",
    file,
    record: path.properties.id,
    field: "",
    message: `${reason}, so it is not used for routes`,
  };
}
