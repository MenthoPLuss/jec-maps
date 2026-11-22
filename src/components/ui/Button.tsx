import type { ButtonHTMLAttributes } from "react";

type Look = "primary" | "secondary" | "quiet";

const LOOKS: Record<Look, string> = {
  primary: "bg-accent text-accent-ink",
  secondary: "border border-line bg-surface text-ink",
  quiet: "text-accent underline underline-offset-2",
};

/** A button that is big enough for a thumb (44 px). */
export default function Button({
  look = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { look?: Look }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${LOOKS[look]} ${className}`}
    />
  );
}
