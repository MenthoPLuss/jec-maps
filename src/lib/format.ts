/** Numbers for people. Inside the app everything stays in metres and seconds. */

/** "8 m", "120 m", "850 m", "1.2 km" */
export function formatDistance(metres: number): string {
  if (metres < 10) return `${Math.max(0, Math.round(metres))} m`;
  if (metres < 100) return `${Math.round(metres / 5) * 5} m`;
  const rounded = Math.round(metres / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return metres < 9_950 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}

/** "< 1 min", "~4 min", "~1 h 10 min" */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

/** A compass direction in words. */
export function formatBearing(deg: number): string {
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** "2nd", "3rd", "11th" */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}
