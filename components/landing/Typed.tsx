"use client";

import { useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ShownContext } from "../Reveal";

/**
 * Text that types itself out one letter at a time once its <Reveal> section is shown (or on
 * mount with `auto`, for the hero). Letters are revealed by a timer setting inline opacity
 * rather than per-letter CSS animations, which Chrome sometimes left stuck invisible.
 *
 * Purely visual: put the readable text in an `sr-only` span and mark the parent `aria-hidden`.
 * `start` continues another <Typed>'s count so several pieces type as one line; `at` is the
 * initial wait in seconds and `step` the time per letter.
 */
export function Typed({ text, start = 0, at = 0, step = 0.07, auto = false }: {
  text: string; start?: number; at?: number; step?: number; auto?: boolean;
}) {
  const shown = useContext(ShownContext) || auto;
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!shown || reduced) return;
    let n = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setCount((n = 1));
      interval = setInterval(() => {
        setCount(++n);
        if (n >= text.length) clearInterval(interval);
      }, step * 1000);
    }, (at + start * step) * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [shown, reduced, text, start, at, step]);

  return (
    <>
      {Array.from(text, (ch, i) => (
        <span key={i} style={{ opacity: i < (reduced && shown ? text.length : count) ? 1 : 0 }}>
          {ch}
        </span>
      ))}
    </>
  );
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(reducedQuery);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(reducedQuery).matches,
    () => false,
  );
}
