import { formatUnits, parseUnits, type Address } from "viem";
import { USDC_DECIMALS } from "./config";

export function formatUsdc(amount: bigint, opts: { decimals?: number } = {}): string {
  const n = Number(formatUnits(amount, USDC_DECIMALS));
  const decimals = opts.decimals ?? (n % 1 === 0 ? 0 : 2);
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, 2) });
}

/** Parses user input like "12.5" into USDC base units. Returns null if invalid. */
export function parseUsdcInput(input: string): bigint | null {
  const v = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{0,6})?$/.test(v)) return null;
  try {
    return parseUnits(v, USDC_DECIMALS);
  } catch {
    return null;
  }
}

/** USDC base units for a naira amount at a rate, rounded up to the nearest cent. */
export function ngnToUsdcUnits(ngn: number, ngnPerUsdc: number): bigint {
  const cents = Math.ceil((ngn / ngnPerUsdc) * 100 - 1e-9);
  return BigInt(cents) * 10_000n;
}

export function formatNgn(amount: number): string {
  return "₦" + Math.round(amount).toLocaleString("en-US");
}

export function usdcToNgn(amount: bigint, ngnPerUsdc: number): number {
  return Number(formatUnits(amount, USDC_DECIMALS)) * ngnPerUsdc;
}

export function shortAddress(a: Address | string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function percent(raised: bigint, target: bigint): number {
  if (target === 0n) return 0;
  return Math.min(100, Number((raised * 10_000n) / target) / 100);
}
