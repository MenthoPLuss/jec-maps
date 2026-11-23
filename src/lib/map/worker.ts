import { setWorkerUrl } from "maplibre-gl";

let configured = false;

/**
 * The map engine's worker comes from our own site (copied there before every dev
 * start and build), never from another one. Has to happen before the first map.
 */
export function configureWorker(): void {
  if (configured) return;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
  configured = true;
}
