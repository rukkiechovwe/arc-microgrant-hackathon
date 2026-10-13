"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OpenRegistryForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-5 flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        // Accepts a full link (".../r/ada-and-tunde-2274681a67cd"), a bare slug, or a number.
        const match = value.trim().toLowerCase().match(/(?:\/r\/)?([a-z0-9-]+)\/?(?:[?#].*)?$/);
        if (!match) {
          setError("That doesn't look like a registry link or number.");
          return;
        }
        router.push(`/r/${match[1]}`);
      }}
    >
      <div className="flex-1">
        <input
          className="input"
          placeholder="Paste your registry link"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="mt-1.5 text-xs text-accent-dark">{error}</p>}
      </div>
      <button className="btn-primary" type="submit">
        Open
      </button>
    </form>
  );
}
