/**
 * Keeps the app's own sources and layers on the map.
 *
 * Every change goes through here, so there is always one current copy of the data.
 * A new style or a restarted graphics card wipes the map: `attach` then puts
 * everything back. In between, data is only kept, never lost.
 */
import type { AddLayerObject, GeoJSONSourceSpecification } from "maplibre-gl";

import type { ThemeName } from "./theme";

export type FeatureCollection = GeoJSON.FeatureCollection;

export const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/** The few map functions that the registry needs. */
export interface LayerHost {
  getSource(id: string): unknown;
  addSource(id: string, source: GeoJSONSourceSpecification): unknown;
  getLayer(id: string): unknown;
  addLayer(layer: AddLayerObject): unknown;
  setPaintProperty(layer: string, name: string, value: unknown): unknown;
}

export interface LayerLook {
  theme: ThemeName;
  fonts: string[];
}

export interface RegistryOptions<SourceId extends string> {
  sources: Record<SourceId, Omit<GeoJSONSourceSpecification, "type" | "data">>;
  /** Every layer, from bottom to top. The same ids for every look. */
  layers: (look: LayerLook) => AddLayerObject[];
  /** Called when new data can't be handed to the map. */
  onError?: (error: unknown) => void;
}

export class LayerRegistry<SourceId extends string> {
  private readonly data = new Map<SourceId, FeatureCollection>();
  private host: LayerHost | null = null;
  private look: LayerLook | null = null;

  constructor(private readonly options: RegistryOptions<SourceId>) {}

  /** Puts everything that is missing on the map. Safe to call again and again. */
  attach(host: LayerHost, look: LayerLook): void {
    this.host = host;
    this.look = look;

    for (const id of this.sourceIds()) {
      if (host.getSource(id)) {
        this.push(id);
      } else {
        host.addSource(id, { ...this.options.sources[id], type: "geojson", data: this.current(id) });
      }
    }
    for (const layer of this.options.layers(look)) {
      if (!host.getLayer(layer.id)) host.addLayer(layer);
    }
  }

  /** The style is gone: keep the data until the next `attach`. */
  detach(): void {
    this.host = null;
  }

  setData(id: SourceId, data: FeatureCollection): void {
    this.data.set(id, data);
    this.push(id);
  }

  current(id: SourceId): FeatureCollection {
    return this.data.get(id) ?? EMPTY;
  }

  /** Recolours the layers without touching their data. */
  setTheme(theme: ThemeName): void {
    if (!this.look || this.look.theme === theme) return;
    this.look = { ...this.look, theme };
    if (!this.host) return;

    for (const layer of this.options.layers(this.look)) {
      if (!("paint" in layer) || !layer.paint || !this.host.getLayer(layer.id)) continue;
      for (const [name, value] of Object.entries(layer.paint)) {
        this.host.setPaintProperty(layer.id, name, value);
      }
    }
  }

  private push(id: SourceId): void {
    const source = this.host?.getSource(id);
    if (!hasSetData(source)) return;
    Promise.resolve(source.setData(this.current(id))).catch((error: unknown) => this.options.onError?.(error));
  }

  private sourceIds(): SourceId[] {
    return Object.keys(this.options.sources) as SourceId[];
  }
}

function hasSetData(source: unknown): source is { setData(data: FeatureCollection): unknown } {
  return typeof source === "object" && source !== null && "setData" in source;
}
