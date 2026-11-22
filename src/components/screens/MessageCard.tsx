interface MessageCardProps {
  title: string;
  children: React.ReactNode;
  /** Buttons. */
  actions?: React.ReactNode;
  /** "alert" interrupts a screen reader, "status" waits for a pause. */
  role?: "alert" | "status";
  testId?: string;
}

/** A card in the middle of the screen: explanations, errors, the locked screen. */
export default function MessageCard({ title, children, actions, role, testId }: MessageCardProps) {
  return (
    <section
      role={role}
      data-testid={testId}
      className="pointer-events-auto max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-surface p-5 text-ink shadow-xl"
    >
      <h1 className="text-lg font-bold">{title}</h1>
      <div className="mt-2 space-y-2 text-sm text-ink-muted">{children}</div>
      {actions && <div className="mt-4 flex flex-col gap-2">{actions}</div>}
    </section>
  );
}
