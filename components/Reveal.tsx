"use client";

import { createContext, useEffect, useRef, useState } from "react";

/** True once the nearest <Reveal> has scrolled into view. Read by <Typed>. */
export const ShownContext = createContext(false);

/**
 * Marks its children as `data-shown` the first time they scroll into view, which starts the
 * `.reveal-*` animations defined in globals.css. Plays once.
 */
export function Reveal({ as: Tag = "div", id, className, children }: {
  as?: "div" | "section"; id?: string; className?: string; children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} id={id} className={className} data-shown={shown ? "" : undefined}>
      <ShownContext.Provider value={shown}>{children}</ShownContext.Provider>
    </Tag>
  );
}
