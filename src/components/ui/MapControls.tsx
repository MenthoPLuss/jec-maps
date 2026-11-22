"use client";

interface MapControlsProps {
  following: boolean;
  onFollow: () => void;
  onPinCentre: () => void;
}

const STYLE =
  "pointer-events-auto flex size-12 items-center justify-center rounded-full bg-surface text-xl text-ink shadow-lg";

/** Follow me, and a way to set a destination without touching the map. */
export default function MapControls({ following, onFollow, onPinCentre }: MapControlsProps) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" aria-label="Set destination at the middle of the map" onClick={onPinCentre} className={STYLE}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2">
          <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.800 12 21 12 21z" />
          <circle cx="12" cy="9.500" r="2.500" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Centre on me"
        aria-pressed={following}
        onClick={onFollow}
        data-testid="recenter"
        className={`${STYLE} ${following ? "text-accent ring-2 ring-accent" : ""}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2">
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.500" className="fill-current" />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
        </svg>
      </button>
    </div>
  );
}
