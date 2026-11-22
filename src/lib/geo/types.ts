/** `[longitude, latitude]` in WGS84 degrees. Never the other way round. */
export type LngLat = [lng: number, lat: number];

/** Metres east (x) and north (y) of some origin. */
export type XY = [x: number, y: number];

/** The middle of the real JEC campus. */
export const JEC_CENTRE: LngLat = [94.2506399, 26.7458283];

/** True for a finite `[lng, lat]` pair inside the valid WGS84 range. */
export function isLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}
