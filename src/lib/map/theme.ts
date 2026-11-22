/** Map colours. The rest of the app takes its colours from globals.css. */

export type ThemeName = "light" | "dark";

export interface MapTheme {
  background: string;
  campus: string;
  campusLine: string;
  path: string;
  pathCasing: string;
  building: string;
  buildingLine: string;
  entrance: string;
  place: string;
  label: string;
  labelHalo: string;
  user: string;
  route: string;
  routeCasing: string;
  routeUnverified: string;
  room: string;
  roomLine: string;
  corridor: string;
}

export const MAP_THEMES: Record<ThemeName, MapTheme> = {
  light: {
    background: "#e6eaef",
    campus: "#f7f8f5",
    campusLine: "#64748b",
    path: "#ffffff",
    pathCasing: "#b8c2cf",
    building: "#cfd8e3",
    buildingLine: "#7c8ba1",
    entrance: "#334155",
    place: "#0f766e",
    label: "#111827",
    labelHalo: "#ffffff",
    user: "#1d4ed8",
    route: "#1d4ed8",
    routeCasing: "#ffffff",
    routeUnverified: "#b45309",
    room: "#fdf6e3",
    roomLine: "#a3906a",
    corridor: "#b8c2cf",
  },
  dark: {
    background: "#0b1220",
    campus: "#131c2e",
    campusLine: "#94a3b8",
    path: "#3b4a61",
    pathCasing: "#1f2a3d",
    building: "#2d3a50",
    buildingLine: "#64748b",
    entrance: "#e2e8f0",
    place: "#2dd4bf",
    label: "#f1f5f9",
    labelHalo: "#0b1220",
    user: "#60a5fa",
    route: "#60a5fa",
    routeCasing: "#0b1220",
    routeUnverified: "#fbbf24",
    room: "#3a3524",
    roomLine: "#a3906a",
    corridor: "#51607a",
  },
};
