"use client";

import { useEffect } from "react";

import Button from "@/components/ui/Button";

/** Shown instead of a blank page when something unexpected breaks. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Only in this browser's console: nothing is reported anywhere.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-sm space-y-4 px-5 py-16 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="text-ink-muted">Nothing was sent anywhere. Try again, or reload the page.</p>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
