"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import DatasetError from "@/components/screens/DatasetError";
import MessageCard from "@/components/screens/MessageCard";
import { useDataset } from "@/hooks/useDataset";
import { ControllerContext } from "@/hooks/useController";
import { config, isMockRequested } from "@/lib/config";
import { CampusController } from "@/lib/controller";
import type { PublishedDataset } from "@/lib/data/published";
import { middleOf } from "@/lib/location/mockPresets";
import { MockLocationProvider } from "@/lib/location/mockProvider";
import { RealLocationProvider, browserEnvironment } from "@/lib/location/realProvider";
import type { Destination } from "@/lib/state/types";

// The map needs a browser, so none of it runs while the page is rendered on the server.
const Campus = dynamic(() => import("./Campus"), {
  ssr: false,
  loading: () => <Centred>Loading the campus map…</Centred>,
});

export interface CampusAppProps {
  /** A destination from a shared link. It says where to go, never where anyone is. */
  linked?: Destination;
}

export default function CampusApp({ linked }: CampusAppProps) {
  const { state, retry } = useDataset();
  const mock = isMockRequested(config, useSearchParams());

  return (
    <main className="app-frame bg-surface-2">
      {state.status === "loading" && <Centred>Loading the campus map…</Centred>}
      {state.status === "failed" && (
        <Centred>
          <DatasetError kind={state.kind} onRetry={retry} />
        </Centred>
      )}
      {state.status === "ready" && (
        // Switching between real and fake GPS starts over: no position may survive it.
        <Connected key={mock ? "mock" : "real"} dataset={state.dataset} mock={mock} linked={linked} />
      )}
    </main>
  );
}

interface ConnectedProps {
  dataset: PublishedDataset;
  mock: boolean;
  linked?: Destination;
}

function Connected({ dataset, mock, linked }: ConnectedProps) {
  const [{ controller, gps }] = useState(() => {
    const fake = mock ? new MockLocationProvider(middleOf(dataset.bounds)) : null;
    const provider = fake ?? new RealLocationProvider(browserEnvironment());
    return { controller: new CampusController({ dataset, provider }), gps: fake };
  });

  useEffect(() => {
    controller.connect();
    controller.restore();
    if (linked) controller.dispatch({ type: "destination/set", destination: linked });
    return () => controller.disconnect();
  }, [controller, linked]);

  if (!dataset.boundary && dataset.buildings.length === 0) {
    return (
      <Centred>
        <MessageCard title="There is no campus data yet">
          <p>The map is empty. Please come back later.</p>
        </MessageCard>
      </Centred>
    );
  }
  return (
    <ControllerContext value={controller}>
      <Campus gps={gps} />
    </ControllerContext>
  );
}

function Centred({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-4">{children}</div>;
}
