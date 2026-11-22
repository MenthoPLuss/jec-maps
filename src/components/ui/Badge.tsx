/** A small label that must never be overlooked, such as "Demo data". */
export default function Badge({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="rounded-full border border-warn bg-warn-surface px-3 py-1 text-xs font-bold text-warn shadow"
    >
      {children}
    </span>
  );
}
