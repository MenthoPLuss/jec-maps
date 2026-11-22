import Button from "@/components/ui/Button";
import type { DatasetState } from "@/hooks/useDataset";

import MessageCard from "./MessageCard";

const TEXTS: Record<Extract<DatasetState, { status: "failed" }>["kind"], string> = {
  offline: "The campus data could not be downloaded. Check your internet connection, then try again.",
  missing: "The campus data is missing on the server. Please try again later.",
  outdated: "Your browser has an old copy of the campus data. Reload the page to get the new one.",
};

export default function DatasetError({ kind, onRetry }: { kind: keyof typeof TEXTS; onRetry: () => void }) {
  return (
    <MessageCard
      role="alert"
      testId="dataset-error"
      title="The map could not be loaded"
      actions={<Button onClick={kind === "outdated" ? () => window.location.reload() : onRetry}>Try again</Button>}
    >
      <p>{TEXTS[kind]}</p>
    </MessageCard>
  );
}
