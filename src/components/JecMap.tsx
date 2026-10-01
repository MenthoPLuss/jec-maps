"use client";

import { useEffect, useRef } from "react";
import {
  Map,
  Marker,
  NavigationControl,
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
        },

        layers: [
          {
            id: "osm",
            type: "raster",
            source: "osm",
          },
        ],
      },

      center: JEC_COORDINATES,
      zoom: 16.5,
    });

    map.addControl(
      new NavigationControl(),
      "top-right"
    );

    new Marker()
      .setLngLat(JEC_COORDINATES)
      .addTo(map);

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