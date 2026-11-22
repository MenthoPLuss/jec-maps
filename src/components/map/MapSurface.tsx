"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { prefersReducedMotion } from "@/hooks/useReducedMotion";
import { config } from "@/lib/config";
import type { PublishedDataset } from "@/lib/data/published";
import { labelFonts, localStyle, onlineStyle } from "@/lib/map/basemap";
import { WORLD, createAppRegistry, staticMapData, type AppSource } from "@/lib/map/layers";
import type { LayerRegistry } from "@/lib/map/registry";
import { MAP_THEMES, type ThemeName } from "@/lib/map/theme";

export interface MapHandle {
  map: MapLibreMap;
  registry: LayerRegistry<AppSource>;
  /** False once the map has been removed: it must not be touched any more. */
  isAlive: () => boolean;
}

/**
 * - `no-webgl`: this device can't draw the map at all.
 * - `no-worker`: a part of the map engine could not be downloaded.
 * - `context-lost`: the graphics card was reset. The map comes back by itself.
 * - `online-failed`: the street map can't be loaded. The campus shapes still work.
 */
export type MapProblem = "no-webgl" | "no-worker" | "context-lost" | "online-failed";

interface MapSurfaceProps {
  dataset: PublishedDataset;
  theme: ThemeName;
  /** Show the street map of the provider. Only after the visitor agreed. */
  online: boolean;
  /** A building is being looked at: what is outside fades. */
  indoors: boolean;
  /** False locks the map: it can be seen, but not moved. */
  interactive: boolean;
  /** Called with the map once it exists, and with null when it goes away. */
  onHandle: (handle: MapHandle | null) => void;
  onProblem: (problem: MapProblem | null) => void;
}

/** How far around the campus the map may be moved, in degrees (about 1.3 km). */
const PADDING_DEG = 0.012;
const ONLINE_TIMEOUT_MS = 12_000;

let workerConfigured = false;

/** Has to happen before the first map. Only ever called in the browser. */
function configureWorker(): void {
  if (workerConfigured) return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  workerConfigured = true;
}

export default function MapSurface(props: MapSurfaceProps) {
  const { dataset, indoors, online, interactive, onHandle, onProblem } = props;
  // A provider's street map is light, so our shapes on top of it are light as well.
  const theme = online ? "light" : props.theme;
  const container = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<MapHandle | null>(null);

  const currentTheme = useEffectEvent(() => theme);
  const isIndoors = useEffectEvent(() => indoors);
  const reportHandle = useEffectEvent(onHandle);
  const reportProblem = useEffectEvent(onProblem);

  useEffect(() => {
    if (!container.current) return;
    configureWorker();

    const [west, south, east, north] = dataset.bounds;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: container.current,
        style: localStyle(currentTheme()),
        bounds: dataset.bounds,
        fitBoundsOptions: { padding: 24 },
        // Also keeps the requests of the online map close to the campus.
        maxBounds: [west - PADDING_DEG, south - PADDING_DEG, east + PADDING_DEG, north + PADDING_DEG],
        maxZoom: 21,
        maxPitch: 60,
        attributionControl: { compact: true, customAttribution: dataset.attribution },
      });
    } catch (error) {
      console.warn("The map can't be drawn on this device.", error);
      reportProblem("no-webgl");
      return;
    }

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    const registry = createAppRegistry((error) => console.warn("Map data could not be updated.", error));
    for (const [id, data] of Object.entries(staticMapData(dataset))) registry.setData(id as AppSource, data);

    registry.setData("world", WORLD);

    // Every new style starts empty, whether it is the first or a replacement.
    map.on("style.load", () => {
      registry.attach(map, {
        theme: currentTheme(),
        fonts: labelFonts(map.getStyle()),
        indoors: isIndoors(),
        still: prefersReducedMotion(),
      });
    });
    map.on("webglcontextlost", () => {
      registry.detach();
      reportProblem("context-lost");
    });
    map.on("webglcontextrestored", () => reportProblem(null));
    // With a listener MapLibre reports errors here instead of throwing them.
    map.on("error", ({ error }) => {
      console.warn("Map:", error?.message ?? error);
      if (/worker/i.test(error?.message ?? "")) reportProblem("no-worker");
    });

    let alive = true;
    const created: MapHandle = { map, registry, isAlive: () => alive };
    setHandle(created);
    reportHandle(created);

    return () => {
      alive = false;
      reportHandle(null);
      setHandle(null);
      registry.detach();
      map.remove();
    };
  }, [dataset]);

  // Light or dark.
  useEffect(() => {
    if (!handle) return;
    const { map, registry } = handle;
    registry.setLook({ theme });
    if (map.getLayer("background")) {
      map.setPaintProperty("background", "background-color", MAP_THEMES[theme].background);
    }
  }, [handle, theme]);

  // Outside or inside a building.
  useEffect(() => {
    handle?.registry.setLook({ indoors, still: prefersReducedMotion() });
  }, [handle, indoors]);

  // Local or online.
  useEffect(() => {
    if (!handle || !online) return;
    return showOnlineMap(
      handle,
      () => localStyle(currentTheme()),
      () => reportProblem("online-failed"),
    );
  }, [handle, online]);

  // Locked or not.
  useEffect(() => {
    if (!handle) return;
    const { map } = handle;
    for (const gesture of [
      map.boxZoom,
      map.doubleClickZoom,
      map.dragPan,
      map.dragRotate,
      map.keyboard,
      map.scrollZoom,
      map.touchPitch,
      map.touchZoomRotate,
    ]) {
      if (interactive) gesture.enable();
      else gesture.disable();
    }
    map.getCanvas().tabIndex = interactive ? 0 : -1;
  }, [handle, interactive]);

  return (
    // MapLibre's stylesheet sets `position: relative` on its container, which beats
    // Tailwind's layered utilities. So the frame is a separate element.
    <div className="absolute inset-0" data-testid="map" data-locked={!interactive}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

/**
 * Swaps in the street map. If it can't be loaded the local map comes back, with
 * all campus shapes. Returns a function that switches back to the local map.
 */
function showOnlineMap(
  { map, registry, isAlive }: MapHandle,
  local: () => ReturnType<typeof localStyle>,
  onFail: () => void,
): () => void {
  let waiting = true;

  const showLocal = () => {
    registry.detach();
    map.setStyle(local(), { diff: false });
  };
  const fail = () => {
    if (!waiting) return;
    waiting = false;
    showLocal();
    onFail();
  };

  const timer = setTimeout(fail, ONLINE_TIMEOUT_MS);
  const onLoad = map.on("style.load", () => {
    waiting = false;
    clearTimeout(timer);
  });
  const onError = map.on("error", () => {
    // Once the style is there, an error is a missing tile: not worth switching back.
    if (waiting) fail();
  });

  registry.detach();
  map.setStyle(onlineStyle(config), { diff: false });

  return () => {
    clearTimeout(timer);
    onLoad.unsubscribe();
    onError.unsubscribe();
    waiting = false;
    if (isAlive()) showLocal();
  };
}
