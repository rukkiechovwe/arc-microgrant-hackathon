"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Underlined "paste your link" field for the site footer (sits on the espresso panel). */
export function OpenRegistryForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // Accepts a full link (".../r/ada-and-tunde-2274681a67cd"), a bare slug, or a number.
        const match = value.trim().toLowerCase().match(/(?:\/r\/)?([a-z0-9-]+)\/?(?:[?#].*)?$/);
        if (!match) {
          setError("That doesn't look like a registry link.");
          return;
        }
        router.push(`/r/${match[1]}`);
      }}
    >
      <div className="flex items-center gap-3 border-b border-paper/70 focus-within:border-paper">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-paper/80" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
        <input
          aria-label="Registry link"
          className="min-w-0 flex-1 bg-transparent py-3 text-lg text-paper outline-none placeholder:text-paper/70"
          placeholder="Got a registry link? Paste it here"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        <button type="submit" aria-label="Open registry" className="p-1 text-paper/80 transition-transform hover:translate-x-1 hover:text-paper">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12h16M14 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <p className="mt-2 text-xs text-paper/70">{error ?? "(We'll take you straight to the wishlist.)"}</p>
    </form>
  );
}
