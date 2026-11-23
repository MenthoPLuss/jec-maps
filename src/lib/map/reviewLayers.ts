/**
 * The layers of the review page. Approved data, candidates and the entrances being
 * placed each have their own colour, and the candidates also differ in line style,
 * so the difference never rests on colour alone.
 */
import type { AddLayerObject, ExpressionSpecification } from "maplibre-gl";

import { LayerRegistry, type LayerLook } from "./registry";
import type { ThemeName } from "./theme";

export type ReviewSource = "approved" | "hints" | "candidates" | "drafts";

/**
 * Feature properties:
 * - candidates: `id`, `label`, `state`: open | chosen | unconnected | approved | blocked
 * - drafts: `id`, `label`, `role`: entrance | door | junction | picked
 * - approved and hints: `id`, `label`, and `used` (true) for paths that routes use
 */
export const REVIEW_SOURCES: ReviewSource[] = ["approved", "hints", "candidates", "drafts"];

/** Layers a click can choose from. */
export const PICK_LAYERS = ["candidate-fill", "candidate-hit", "candidate-point"];

export interface ReviewColours {
  open: string;
  chosen: string;
  unconnected: string;
  approved: string;
  hint: string;
  draft: string;
  label: string;
  halo: string;
}

export const REVIEW_COLOURS: Record<ThemeName, ReviewColours> = {
  light: {
    open: "#b45309",
    chosen: "#1d4ed8",
    unconnected: "#b91c1c",
    approved: "#15803d",
    hint: "#6b7280",
    draft: "#7e22ce",
    label: "#111827",
    halo: "#ffffff",
  },
  dark: {
    open: "#fbbf24",
    chosen: "#60a5fa",
    unconnected: "#f87171",
    approved: "#4ade80",
    hint: "#9ca3af",
    draft: "#d8b4fe",
    label: "#f1f5f9",
    halo: "#0b1220",
  },
};

const isArea: ExpressionSpecification = ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["==", ["geometry-type"], "Point"];

export function reviewLayers({ theme, fonts }: LayerLook): AddLayerObject[] {
  const c = REVIEW_COLOURS[theme];
  const byState: ExpressionSpecification = [
    "match",
    ["get", "state"],
    "chosen",
    c.chosen,
    "unconnected",
    c.unconnected,
    "approved",
    c.approved,
    "blocked",
    c.hint,
    c.open,
  ];
  const state = (...states: string[]): ExpressionSpecification => ["in", ["get", "state"], ["literal", states]];

  return [
    // What is approved: the ground everything else is judged against.
    { id: "approved-fill", type: "fill", source: "approved", filter: isArea, paint: { "fill-color": c.approved, "fill-opacity": 0.12 } },
    { id: "approved-outline", type: "line", source: "approved", filter: isArea, paint: { "line-color": c.approved, "line-width": 1.5 } },
    {
      id: "approved-line",
      type: "line",
      source: "approved",
      filter: isLine,
      layout: { "line-cap": "round" },
      paint: { "line-color": ["case", ["==", ["get", "used"], true], c.approved, c.hint], "line-width": 3 },
    },

    // Recorded walks and photo positions: only a guide.
    {
      id: "hint-line",
      type: "line",
      source: "hints",
      filter: isLine,
      paint: { "line-color": c.hint, "line-width": 2, "line-dasharray": [1, 2] },
    },

    // Candidates. Open ones are dashed, chosen ones solid.
    { id: "candidate-fill", type: "fill", source: "candidates", filter: isArea, paint: { "fill-color": byState, "fill-opacity": 0.18 } },
    {
      id: "candidate-outline-open",
      type: "line",
      source: "candidates",
      filter: ["all", isArea, state("open", "blocked")],
      paint: { "line-color": byState, "line-width": 2, "line-dasharray": [2, 2] },
    },
    {
      id: "candidate-outline",
      type: "line",
      source: "candidates",
      filter: ["all", isArea, ["!", state("open", "blocked")]],
      paint: { "line-color": byState, "line-width": 3 },
    },
    {
      id: "candidate-line-open",
      type: "line",
      source: "candidates",
      filter: ["all", isLine, state("open", "blocked")],
      paint: { "line-color": byState, "line-width": 3, "line-dasharray": [2, 1.5] },
    },
    {
      id: "candidate-line",
      type: "line",
      source: "candidates",
      filter: ["all", isLine, ["!", state("open", "blocked")]],
      layout: { "line-cap": "round" },
      paint: { "line-color": byState, "line-width": ["case", state("unconnected"), 4, 5] },
    },
    {
      id: "candidate-line-gap",
      type: "line",
      source: "candidates",
      filter: ["all", isLine, state("unconnected")],
      paint: { "line-color": c.halo, "line-width": 2, "line-dasharray": [1, 2] },
    },
    // Thin lines are hard to hit with a finger: this one is wide and invisible.
    { id: "candidate-hit", type: "line", source: "candidates", filter: isLine, paint: { "line-color": c.chosen, "line-width": 18, "line-opacity": 0 } },

    {
      id: "hint-point",
      type: "circle",
      source: "hints",
      filter: isPoint,
      paint: { "circle-radius": 7, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": c.hint, "circle-stroke-width": 2 },
    },
    {
      id: "approved-point",
      type: "circle",
      source: "approved",
      filter: isPoint,
      paint: { "circle-radius": 5, "circle-color": c.approved, "circle-stroke-color": c.halo, "circle-stroke-width": 1.5 },
    },
    {
      id: "candidate-point",
      type: "circle",
      source: "candidates",
      filter: isPoint,
      paint: { "circle-radius": 7, "circle-color": byState, "circle-stroke-color": c.halo, "circle-stroke-width": 2 },
    },

    // Entrances being placed: the door, the junctions on offer, and the drafts.
    {
      id: "draft-junction",
      type: "circle",
      source: "drafts",
      filter: ["in", ["get", "role"], ["literal", ["junction", "picked"]]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "role"], "picked"], 7, 5],
        "circle-color": ["case", ["==", ["get", "role"], "picked"], c.draft, c.halo],
        "circle-stroke-color": c.draft,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "draft-entrance",
      type: "circle",
      source: "drafts",
      filter: ["in", ["get", "role"], ["literal", ["entrance", "door"]]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "role"], "door"], 9, 6],
        "circle-color": ["case", ["==", ["get", "role"], "door"], "rgba(0,0,0,0)", c.draft],
        "circle-stroke-color": c.draft,
        "circle-stroke-width": 3,
      },
    },

    {
      id: "review-labels",
      type: "symbol",
      source: "candidates",
      // Buildings and places. Dozens of path labels would hide the paths.
      filter: ["all", ["!", isLine], ["!=", ["get", "label"], ""]],
      layout: {
        "text-field": ["get", "label"],
        "text-font": fonts,
        "text-size": 12,
        "text-max-width": 9,
        "symbol-placement": "point",
      },
      paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.5 },
    },
  ];
}

export function createReviewRegistry(onError: (error: unknown) => void): LayerRegistry<ReviewSource> {
  return new LayerRegistry<ReviewSource>({
    sources: { approved: {}, hints: {}, candidates: {}, drafts: {} },
    layers: reviewLayers,
    onError,
  });
}
