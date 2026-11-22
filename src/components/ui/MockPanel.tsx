"use client";

import { useState, useSyncExternalStore } from "react";

import { useAppState, useController } from "@/hooks/useController";
import { mockPresets } from "@/lib/location/mockPresets";
import type { MockLocationProvider } from "@/lib/location/mockProvider";
import type { ProviderProblem } from "@/lib/location/types";

interface MockPanelProps {
  gps: MockLocationProvider;
  /** What a click on the map does: choose a destination, or move the fake user. */
  teleporting: boolean;
  onTeleporting: (teleporting: boolean) => void;
}

const PROBLEMS: ProviderProblem[] = ["denied", "timeout", "unavailable", "insecure", "unsupported"];
const SMALL = "min-h-9 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink";

/** The controls of the fake GPS. Only in demo builds. */
export default function MockPanel({ gps, teleporting, onTeleporting }: MockPanelProps) {
  const { dataset, disableLocation, dispatch } = useController();
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(gps.onStateChange, gps.getState, gps.getState);
  const route = useAppState(({ navigation }) => (navigation.status === "active" ? navigation.route : null));

  return (
    <section aria-label="Fake GPS" className="pointer-events-auto w-full max-w-sm text-xs text-ink">
      <button
        type="button"
        data-testid="mock-badge"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mx-auto block rounded-full border border-danger bg-danger-surface px-3 py-1 font-bold text-danger shadow"
      >
        MOCK GPS {open ? "▴" : "▾"}
      </button>

      {open && (
        <div
          data-testid="mock-panel"
          className="mt-2 max-h-[50dvh] space-y-3 overflow-y-auto rounded-2xl bg-surface p-3 shadow-xl"
        >
          <fieldset className="space-y-1">
            <legend className="font-semibold">A click on the map</legend>
            {[
              [false, "sets the destination"],
              [true, "moves the fake user"],
            ].map(([value, label]) => (
              <label key={String(label)} className="flex min-h-8 items-center gap-2">
                <input
                  type="radio"
                  name="mock-click"
                  checked={teleporting === value}
                  onChange={() => onTeleporting(value as boolean)}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-1.5">
            {mockPresets(dataset).map((preset) => (
              <button key={preset.id} type="button" className={SMALL} onClick={() => gps.run(preset.steps)}>
                {preset.name}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={SMALL} disabled={!route} onClick={() => route && gps.walk(route.line)}>
              Walk the route
            </button>
            <button type="button" className={SMALL} onClick={() => (state.walking ? gps.pauseWalk() : gps.resumeWalk())}>
              {state.walking ? "Pause" : "Go on"}
            </button>
            <button type="button" className={SMALL} onClick={() => gps.setSignal(!state.signal)}>
              Signal: {state.signal ? "on" : "off"}
            </button>
          </div>

          <Slider label="Speed" unit="m/s" min={0.5} max={10} step={0.1} value={state.walkSpeedMps} onChange={(value) => gps.setWalkSpeed(value)} />
          <Slider label="Accuracy" unit="m" min={3} max={150} step={1} value={state.accuracyM} onChange={(value) => gps.setAccuracy(value)} />
          <Slider label="Jitter" unit="m" min={0} max={30} step={1} value={state.jitterM} onChange={(value) => gps.setJitter(value)} />

          <div className="flex flex-wrap gap-1.5">
            {PROBLEMS.map((problem) => (
              <button key={problem} type="button" className={SMALL} onClick={() => gps.fail(problem)}>
                Error: {problem}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={SMALL}
            onClick={() => {
              disableLocation();
              gps.reset();
              dispatch({ type: "destination/cleared" });
              onTeleporting(false);
            }}
          >
            Reset everything
          </button>
        </div>
      )}
    </section>
  );
}

interface SliderProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function Slider({ label, unit, value, onChange, ...range }: SliderProps) {
  return (
    <label className="block">
      {label}: {value} {unit}
      <input
        type="range"
        aria-label={label}
        {...range}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="block min-h-8 w-full"
      />
    </label>
  );
}
