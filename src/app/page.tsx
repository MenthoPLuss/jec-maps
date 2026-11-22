import { Suspense } from "react";

import JecMap from "@/components/JecMap";

export default function Home() {
  return (
    // The map reads the address (?mock=1), which is unknown while the page is built.
    <Suspense fallback={<p className="p-6 text-center">Loading the campus map…</p>}>
      <JecMap />
    </Suspense>
  );
}
