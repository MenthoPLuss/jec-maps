"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Map,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";

import SearchBar from "@/components/SearchBar";

import PlaceEditor from "@/components/PlaceEditor";

import {
  createPlayer3DLayer,
  type Player3DLayer,
} from "@/components/Player3D";

import type {
  Place,
} from "@/data/places";

setWorkerUrl(
  "/maplibre/maplibre-gl-worker.mjs"
);

const JEC_COORDINATES:
  [number, number] = [
    94.2506399,
    26.7458283,
  ];

export default function JecMap() {
  const [
    clickedCoordinates,
    setClickedCoordinates,
  ] = useState<{
    lng: number;
    lat: number;
  } | null>(null);

  const mapContainer =
    useRef<HTMLDivElement | null>(
      null
    );

  const mapRef =
    useRef<Map | null>(
      null
    );

  const selectedMarkerRef =
    useRef<Marker | null>(
      null
    );

  const playerLayerRef =
    useRef<Player3DLayer | null>(
      null
    );

  useEffect(() => {
    if (
      !mapContainer.current ||
      mapRef.current
    ) {
      return;
    }

    const map = new Map({
      container:
        mapContainer.current,

      style:
        "https://tiles.openfreemap.org/styles/liberty",

      center:
        JEC_COORDINATES,

      zoom: 18,

      pitch: 60,

      bearing: -20,

      maxPitch: 80,

      maxZoom: 20,

      canvasContextAttributes: {
        antialias: true,
      },
    });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({
        visualizePitch: true,
      }),

      "top-right"
    );

    map.on("load", () => {
      // -------------------------
      // CAMPUS BOUNDARY
      // -------------------------

      if (
        !map.getSource(
          "campus-boundary"
        )
      ) {
        map.addSource(
          "campus-boundary",
          {
            type: "geojson",

            data:
              "/data/campus-boundary.geojson",
          }
        );
      }

      // -------------------------
      // BUILDINGS
      // -------------------------

      if (
        !map.getSource(
          "buildings"
        )
      ) {
        map.addSource(
          "buildings",
          {
            type: "geojson",

            data:
              "/data/buildings.geojson",
          }
        );
      }

      // -------------------------
      // WALKING PATHS
      // -------------------------

      if (
        !map.getSource(
          "walking-paths"
        )
      ) {
        map.addSource(
          "walking-paths",
          {
            type: "geojson",

            data:
              "/data/walking-paths.geojson",
          }
        );
      }

      // -------------------------
      // CAMPUS FILL
      // -------------------------

      if (
        !map.getLayer(
          "campus-boundary-fill"
        )
      ) {
        map.addLayer({
          id:
            "campus-boundary-fill",

          type: "fill",

          source:
            "campus-boundary",

          paint: {
            "fill-color":
              "#2563eb",

            "fill-opacity":
              0.08,
          },
        });
      }

      // -------------------------
      // CAMPUS BORDER
      // -------------------------

      if (
        !map.getLayer(
          "campus-boundary-line"
        )
      ) {
        map.addLayer({
          id:
            "campus-boundary-line",

          type: "line",

          source:
            "campus-boundary",

          paint: {
            "line-color":
              "#2563eb",

            "line-width":
              3,
          },
        });
      }

      // -------------------------
      // BUILDINGS
      // -------------------------

      if (
        !map.getLayer(
          "buildings-fill"
        )
      ) {
        map.addLayer({
          id:
            "buildings-fill",

          type: "fill",

          source:
            "buildings",

          paint: {
            "fill-color":
              "#0f766e",

            "fill-opacity":
              0.55,
          },
        });
      }

      if (
        !map.getLayer(
          "buildings-outline"
        )
      ) {
        map.addLayer({
          id:
            "buildings-outline",

          type: "line",

          source:
            "buildings",

          paint: {
            "line-color":
              "#134e4a",

            "line-width":
              1.5,
          },
        });
      }

      // -------------------------
      // WALKING PATHS
      // -------------------------

      if (
        !map.getLayer(
          "walking-paths-line"
        )
      ) {
        map.addLayer({
          id:
            "walking-paths-line",

          type: "line",

          source:
            "walking-paths",

          layout: {
            "line-cap":
              "round",

            "line-join":
              "round",
          },

          paint: {
            "line-color":
              "#2563eb",

            "line-width":
              5,

            "line-opacity":
              0.85,
          },
        });
      }

      // -------------------------
      // 3D PLAYER
      // -------------------------

      if (
        !map.getLayer(
          "jec-player-3d"
        )
      ) {
        const playerLayer =
          createPlayer3DLayer(
            JEC_COORDINATES
          );

        playerLayerRef.current =
          playerLayer;

        map.addLayer(
          playerLayer
        );
      }

      // -------------------------
      // BUILDING HOVER
      // -------------------------

      map.on(
        "mouseenter",
        "buildings-fill",
        () => {
          map
            .getCanvas()
            .style
            .cursor = "pointer";
        }
      );

      map.on(
        "mouseleave",
        "buildings-fill",
        () => {
          map
            .getCanvas()
            .style
            .cursor = "";
        }
      );

      // -------------------------
      // BUILDING POPUP
      // -------------------------

      map.on(
        "click",
        "buildings-fill",
        (event) => {
          const feature =
            event
              .features?.[0];

          if (!feature) {
            return;
          }

          const content =
            document
              .createElement(
                "div"
              );

          const title =
            document
              .createElement(
                "strong"
              );

          title.textContent =
            String(
              feature
                .properties
                ?.name ??
                "JEC Building"
            );

          content.appendChild(
            title
          );

          if (
            feature
              .properties
              ?.category
          ) {
            const category =
              document
                .createElement(
                  "div"
                );

            category.textContent =
              String(
                feature
                  .properties
                  .category
              );

            content
              .appendChild(
                category
              );
          }

          new Popup({
            offset: 12,
          })
            .setLngLat(
              event.lngLat
            )
            .setDOMContent(
              content
            )
            .addTo(map);
        }
      );
    });

    // -------------------------
    // COORDINATE CAPTURE
    // -------------------------

    map.on(
      "click",
      (event) => {
        setClickedCoordinates({
          lng:
            event
              .lngLat
              .lng,

          lat:
            event
              .lngLat
              .lat,
        });
      }
    );

    return () => {
      if (
        selectedMarkerRef
          .current
      ) {
        selectedMarkerRef
          .current
          .remove();

        selectedMarkerRef.current =
          null;
      }

      playerLayerRef.current =
        null;

      map.remove();

      mapRef.current =
        null;
    };
  }, []);

  const handleSelectPlace = (
    place: Place
  ) => {
    const map =
      mapRef.current;

    if (!map) {
      return;
    }

    map.flyTo({
      center:
        place.coordinates,

      zoom: 18,

      pitch: 60,

      duration: 1500,

      essential: true,
    });

    if (
      selectedMarkerRef
        .current
    ) {
      selectedMarkerRef
        .current
        .remove();
    }

    const popupContent =
      document.createElement(
        "div"
      );

    const title =
      document.createElement(
        "strong"
      );

    title.textContent =
      place.name;

    popupContent
      .appendChild(
        title
      );

    const category =
      document.createElement(
        "div"
      );

    category.textContent =
      place.category;

    popupContent
      .appendChild(
        category
      );

    const popup =
      new Popup({
        offset: 20,
      }).setDOMContent(
        popupContent
      );

    const marker =
      new Marker({
        color: "#2563eb",
      })
        .setLngLat(
          place.coordinates
        )
        .setPopup(
          popup
        )
        .addTo(
          map
        );

    marker.togglePopup();

    selectedMarkerRef.current =
      marker;
  };

  return (
    <div className="relative h-screen w-full">
      <SearchBar
        onSelectPlace={
          handleSelectPlace
        }
      />

      <PlaceEditor
        coordinates={
          clickedCoordinates
        }
      />

      <div
        className="absolute right-4 top-20 z-20 rounded-xl bg-black/70 px-3 py-2 text-sm font-semibold text-white backdrop-blur"
      >
        3D PLAYER MODE
      </div>

      <div
        ref={
          mapContainer
        }
        className="h-full w-full"
      />
    </div>
  );
}
