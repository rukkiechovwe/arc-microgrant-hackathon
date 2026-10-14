import type { CSSProperties } from "react";

/** Inline style that sets the `--delay` a `.reveal-*` animation waits before starting. */
export function delay(seconds: number): CSSProperties {
  return { "--delay": `${seconds}s` } as CSSProperties;
}
