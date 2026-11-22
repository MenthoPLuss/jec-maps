import Button from "./Button";

interface OnlineMapPromptProps {
  provider: string;
  onAccept: () => void;
  onDecline: () => void;
}

/** Nothing is loaded from the map provider before the visitor says yes here. */
export default function OnlineMapPrompt({ provider, onAccept, onDecline }: OnlineMapPromptProps) {
  return (
    <section
      aria-labelledby="online-map-title"
      data-testid="online-map-prompt"
      className="pointer-events-auto w-full max-w-sm rounded-2xl bg-surface p-4 text-ink shadow-xl"
    >
      <h2 id="online-map-title" className="font-bold">
        Load the street map?
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        It comes from <strong className="text-ink">{provider}</strong>, which then sees which part of the map you look
        at and your network address. Your GPS position and your routes are never sent. The simple map works without it.
      </p>
      <div className="mt-3 flex gap-2">
        <Button onClick={onAccept}>Load street map</Button>
        <Button look="secondary" onClick={onDecline}>
          Keep simple map
        </Button>
      </div>
    </section>
  );
}
