"use client";

import { useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import { useController } from "@/hooks/useController";
import { usePlans } from "@/hooks/usePlans";
import type { Room } from "@/lib/data/schemas";
import { stepsOf } from "@/lib/routing/instructions";
import type { Route } from "@/lib/routing/route";

/**
 * The way in steps. Inside, only the user knows which one they are at, so they move it
 * on themselves. Nothing in here is tracked.
 */
export default function StepList({ route, room }: { route: Route; room: Room | null }) {
  const { dataset, dispatch } = useController();
  const plans = usePlans(room?.buildingId ?? null);
  const steps = useMemo(() => stepsOf(route, dataset, room, plans), [dataset, plans, room, route]);
  // A new route starts from its first step.
  const [progress, setProgress] = useState({ route, index: 0 });
  const index = progress.route === route ? Math.min(progress.index, steps.length - 1) : 0;

  const show = (next: number) => {
    setProgress({ route, index: next });
    const { buildingId, level } = steps[next];
    if (buildingId !== null && level !== null) dispatch({ type: "view/opened", buildingId, level });
  };

  if (steps.length < 2) return null;

  return (
    <div data-testid="steps" className="space-y-2">
      <ol className="space-y-1 text-sm">
        {steps.map((step, i) => (
          <li
            key={`${i}-${step.text}`}
            aria-current={i === index ? "step" : undefined}
            className={`flex gap-2 rounded-lg px-2 py-1.5 ${i === index ? "bg-surface-2 font-semibold" : "text-ink-muted"}`}
          >
            <span aria-hidden>{i + 1}.</span>
            {step.text}
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button look="secondary" disabled={index === 0} onClick={() => show(index - 1)}>
          Step back
        </Button>
        <Button disabled={index === steps.length - 1} onClick={() => show(index + 1)}>
          Next step
        </Button>
      </div>
    </div>
  );
}
