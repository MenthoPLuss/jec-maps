import { useEffect, useRef } from "react";

/** Moves the focus to a card when it opens, or when it shows something else. */
export function useFocusOnOpen<T extends HTMLElement>(what: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (what !== "") ref.current?.focus({ preventScroll: true });
  }, [what]);

  return ref;
}
