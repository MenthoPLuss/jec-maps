import InfoBar from "@/components/ui/InfoBar";
import { APP_NAME } from "@/lib/text";

/** Part of the page itself, so that there is something to read before any script runs. */
export default function Welcome() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex flex-1 items-center justify-center p-4">
        <section className="w-full max-w-sm rounded-2xl bg-surface p-5 text-ink shadow-xl">
          <h1 className="text-lg font-bold">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Find a building, a place or a room on campus, and walk there. The map unlocks when you are on campus. Your
            position stays on this device: nothing about where you are, where you go or which room you are in is sent
            anywhere.
          </p>
          <p className="mt-3 text-sm text-ink">Loading the campus map…</p>
        </section>
      </div>
      <div className="bg-surface pb-[var(--safe-bottom)]">
        <InfoBar />
      </div>
    </div>
  );
}
