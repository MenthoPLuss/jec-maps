import Link from "next/link";

import { DISCLAIMER } from "@/lib/text";

/** A normal, scrolling page of text: About, Privacy, Help. */
export default function TextPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 leading-relaxed">
      <Link href="/" className="inline-block py-2 font-medium text-accent underline underline-offset-2">
        ← Back to the map
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <div className="mt-4 space-y-4 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
      <p className="mt-10 border-t border-line pt-4 text-sm text-ink-muted">{DISCLAIMER}.</p>
    </main>
  );
}
