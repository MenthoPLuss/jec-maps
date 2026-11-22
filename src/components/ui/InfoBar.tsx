import Link from "next/link";

import { DISCLAIMER } from "@/lib/text";

/** The disclaimer and the links that are always within reach, on and off campus. */
export default function InfoBar() {
  return (
    <footer className="px-3 py-1.5 text-center text-[11px] leading-tight text-ink-muted">
      <p>{DISCLAIMER}</p>
      <nav aria-label="Information" className="flex justify-center gap-1">
        {[
          ["/about", "About"],
          ["/privacy", "Privacy"],
          ["/help", "Help"],
        ].map(([href, name]) => (
          <Link key={href} href={href} className="px-2 py-1.5 font-medium text-accent underline underline-offset-2">
            {name}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
