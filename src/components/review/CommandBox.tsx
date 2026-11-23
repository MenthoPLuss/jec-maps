"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";

/** Commands to copy into a terminal in the project folder. */
export default function CommandBox({ commands }: { commands: string[] }) {
  const [message, setMessage] = useState("");
  const text = commands.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied. Paste it into a terminal in the project folder.");
    } catch {
      setMessage("Copying is blocked. Select the text and copy it yourself.");
    }
  };

  return (
    <div className="space-y-2">
      <pre data-testid="approve-command" className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 font-mono text-xs">
        {text}
      </pre>
      {commands.length > 1 && <p>The list is too long for one command: run them one after the other.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={copy}>{commands.length > 1 ? "Copy the commands" : "Copy the command"}</Button>
        <p role="status" className="text-ink-muted">
          {message}
        </p>
      </div>
      <p className="text-ink-muted">
        To try it first without changing anything, add <code>--dry-run</code> at the end. When it is done, press
        &ldquo;Reload approved data&rdquo; at the top.
      </p>
    </div>
  );
}
