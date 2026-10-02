"use client";

import { useEffect, useRef } from "react";
import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const JEC_COORDINATES: [number, number] = [
  94.2506399,
  26.7458283,
];

export default function JecMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const map = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [
              "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
          "campus-boundary": {
            type: "geojson",
            data: "/data/campus-boundary.geojson",
          },
          buildings: {
            type: "geojson",
            data: "/data/buildings.geojson",
          },
        },
        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
          {
            id: "campus-boundary-fill",
            type: "fill",
            source: "campus-boundary",
            paint: {
              "fill-color": "#2563eb",
              "fill-opacity": 0.08,
            },
          },
          {
            id: "campus-boundary-line",
            type: "line",
            source: "campus-boundary",
            paint: {
              "line-color": "#1d4ed8",
              "line-width": 3,
            },
          },
          {
            id: "buildings-fill",
            type: "fill",
            source: "buildings",
            paint: {
              "fill-color": "#0f766e",
              "fill-opacity": 0.55,
            },
          },
          {
            id: "buildings-outline",
            type: "line",
            source: "buildings",
            paint: {
              "line-color": "#134e4a",
              "line-width": 1.5,
            },
          },
        ],
      },
      center: JEC_COORDINATES,
      zoom: 16.5,
    });

    map.addControl(new NavigationControl(), "top-right");

    new Marker()
      .setLngLat(JEC_COORDINATES)
      .addTo(map);

    map.on("mouseenter", "buildings-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "buildings-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "buildings-fill", (event) => {
      const feature = event.features?.[0];

      if (!feature) {
        return;
      }

      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = String(
        feature.properties?.name ?? "JEC building"
      );
      content.appendChild(title);

      if (feature.properties?.category) {
        const category = document.createElement("div");
        category.textContent = String(feature.properties.category);
        content.appendChild(category);
      }

      new Popup({ offset: 12 })
        .setLngLat(event.lngLat)
        .setDOMContent(content)
        .addTo(map);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mapContainer}
      className="h-screen w-full"
    />
  );
}
