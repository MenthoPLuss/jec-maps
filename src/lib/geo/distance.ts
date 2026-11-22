import type { LngLat } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

/** Straight-line distance in metres (haversine). */
export function distanceM([lngA, latA]: LngLat, [lngB, latB]: LngLat): number {
  const dLat = (latB - latA) * RAD;
  const dLng = (lngB - lngA) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA * RAD) * Math.cos(latB * RAD) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass direction from a to b: 0 is north, 90 is east. Always in [0, 360). */
export function bearingDeg([lngA, latA]: LngLat, [lngB, latB]: LngLat): number {
  const dLng = (lngB - lngA) * RAD;
  const y = Math.sin(dLng) * Math.cos(latB * RAD);
  const x =
    Math.cos(latA * RAD) * Math.sin(latB * RAD) -
    Math.sin(latA * RAD) * Math.cos(latB * RAD) * Math.cos(dLng);

  return normaliseDeg(Math.atan2(y, x) / RAD);
}

/** The point `metres` away from `origin` in the given compass direction. */
export function destinationPoint([lng, lat]: LngLat, bearing: number, metres: number): LngLat {
  const angle = metres / EARTH_RADIUS_M;
  const direction = bearing * RAD;
  const lat1 = lat * RAD;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angle) + Math.cos(lat1) * Math.sin(angle) * Math.cos(direction),
  );
  const lng2 =
    lng * RAD +
    Math.atan2(
      Math.sin(direction) * Math.sin(angle) * Math.cos(lat1),
      Math.cos(angle) - Math.sin(lat1) * Math.sin(lat2),
    );

  return [lng2 / RAD, lat2 / RAD];
}

/** Any angle in degrees, brought into [0, 360). */
export function normaliseDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** How far to turn from one bearing to another: -180 (left) to 180 (right). */
export function turnDeg(from: number, to: number): number {
  const turn = normaliseDeg(to - from);
  return turn > 180 ? turn - 360 : turn;
}
