import { useEffect, useState } from "react";

/** True once the browser has had a quiet moment, or after a second and a half. */
export function useIdle(): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const done = () => setIdle(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(done, { timeout: 1_500 });
      return () => window.cancelIdleCallback(id);
    }
    // Safari
    const id = setTimeout(done, 500);
    return () => clearTimeout(id);
  }, []);

  return idle;
}
