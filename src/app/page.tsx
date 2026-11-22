import { Suspense } from "react";

import JecMap from "@/components/JecMap";
import Welcome from "@/components/Welcome";

export default function Home() {
  return (
    // The map reads the address (?mock=1), which is unknown while the page is built.
    <Suspense
      fallback={
        <main className="app-frame bg-surface-2">
          <Welcome />
        </main>
      }
    >
      <JecMap />
    </Suspense>
  );
}
