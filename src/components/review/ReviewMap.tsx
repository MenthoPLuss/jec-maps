"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import type { LngLat } from "@/lib/geo/types";
import { labelFonts, localStyle } from "@/lib/map/basemap";
import type { FeatureCollection, LayerRegistry } from "@/lib/map/registry";
import { PICK_LAYERS, REVIEW_SOURCES, createReviewRegistry, type ReviewSource } from "@/lib/map/reviewLayers";
import { MAP_THEMES, type ThemeName } from "@/lib/map/theme";
import { configureWorker } from "@/lib/map/worker";

export type Bounds = [west: number, south: number, east: number, north: number];

export interface MapClick {
  /** The candidate under the click, if any. */
  id: string | null;
  at: LngLat;
}

interface ReviewMapProps {
  theme: ThemeName;
  data: Record<ReviewSource, FeatureCollection>;
  /** A new key frames the bounds again. */
  frame: { bounds: Bounds; key: number };
  /** Credit for the data on the map. */
  attribution: string;
  onClick: (click: MapClick) => void;
  onProblem: (message: string) => void;
}

/** A click this close to a line or point counts as a click on it, in pixels. */
const PICK_SLOP_PX = 6;

export default function ReviewMap({ theme, data, frame, attribution, onClick, onProblem }: ReviewMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<{ map: MapLibreMap; registry: LayerRegistry<ReviewSource> } | null>(null);

  const firstFrame = useEffectEvent(() => frame.bounds);
  const currentTheme = useEffectEvent(() => theme);
  const report = useEffectEvent(onProblem);
  const click = useEffectEvent(onClick);

  useEffect(() => {
    if (!container.current) return;
    configureWorker();

    let created: MapLibreMap;
    try {
      created = new MapLibreMap({
        container: container.current,
        style: localStyle(currentTheme()),
        bounds: firstFrame(),
        fitBoundsOptions: { padding: 32 },
        maxZoom: 21,
        attributionControl: { compact: true, customAttribution: attribution },
      });
    } catch (error) {
      console.warn("The map can't be drawn on this device.", error);
      report("This browser can't draw the map. The lists still work.");
      return;
    }
    created.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const registry = createReviewRegistry((error) => console.warn("Map data could not be updated.", error));
    created.on("style.load", () => {
      registry.attach(created, { theme: currentTheme(), fonts: labelFonts(created.getStyle()), indoors: false, still: true });
    });
    created.on("error", ({ error }) => {
      console.warn("Map:", error?.message ?? error);
      if (/worker/i.test(error?.message ?? "")) report("A part of the map could not be loaded. Reload the page.");
    });

    created.on("click", ({ point, lngLat }) => {
      const layers = PICK_LAYERS.filter((layer) => created.getLayer(layer));
      const [hit] = created.queryRenderedFeatures(
        [
          [point.x - PICK_SLOP_PX, point.y - PICK_SLOP_PX],
          [point.x + PICK_SLOP_PX, point.y + PICK_SLOP_PX],
        ],
        { layers },
      );
      const id = hit?.properties?.id;
      click({ id: typeof id === "string" ? id : null, at: [round(lngLat.lng), round(lngLat.lat)] });
    });
    for (const layer of PICK_LAYERS) {
      created.on("mouseenter", layer, () => (created.getCanvas().style.cursor = "pointer"));
      created.on("mouseleave", layer, () => (created.getCanvas().style.cursor = ""));
    }

    // Lets the browser tests find things on the map. This page never exists in a normal build.
    const hook = window as unknown as { __jecReview?: unknown };
    hook.__jecReview = {
      project: (position: LngLat) => {
        const { x, y } = created.project(position);
        return { x, y };
      },
    };

    setMap({ map: created, registry });
    return () => {
      delete hook.__jecReview;
      setMap(null);
      registry.detach();
      created.remove();
    };
  }, [attribution]);

  useEffect(() => {
    if (!map) return;
    for (const source of REVIEW_SOURCES) map.registry.setData(source, data[source]);
  }, [map, data]);

  useEffect(() => {
    if (!map) return;
    map.registry.setLook({ theme });
    if (map.map.getLayer("background")) {
      map.map.setPaintProperty("background", "background-color", MAP_THEMES[theme].background);
    }
  }, [map, theme]);

  useEffect(() => {
    if (!map) return;
    map.map.fitBounds(frame.bounds, { padding: 48, maxZoom: 19, duration: prefersReducedMotion() ? 0 : 400 });
  }, [map, frame]);

  return (
    // MapLibre's stylesheet sets `position: relative` on its container, which beats
    // Tailwind's layered utilities. So the frame is a separate element.
    <div className="absolute inset-0" data-testid="review-map">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
