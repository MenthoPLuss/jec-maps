import { useEffect, useState } from "react";

import { DatasetError, loadDataset } from "@/lib/data/client";
import type { PublishedDataset } from "@/lib/data/published";

export type DatasetState =
  | { status: "loading" }
  | { status: "ready"; dataset: PublishedDataset }
  | { status: "failed"; kind: DatasetError["kind"] };

/** Downloads the campus data once, with a way to try again. */
export function useDataset(): { state: DatasetState; retry: () => void } {
  const [state, setState] = useState<DatasetState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    loadDataset(controller.signal).then(
      (dataset) => setState({ status: "ready", dataset }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "failed", kind: error instanceof DatasetError ? error.kind : "offline" });
      },
    );

    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((count) => count + 1);
  };

  return { state, retry };
}
