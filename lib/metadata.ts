import { keccak256, stringToHex, type Hex } from "viem";
import { z } from "zod";

export const OCCASIONS = {
  wedding: "Wedding",
  birthday: "Birthday",
  graduation: "Graduation",
  "baby-shower": "Baby shower",
  housewarming: "Housewarming",
  anniversary: "Anniversary",
  other: "Celebration",
} as const;
export type Occasion = keyof typeof OCCASIONS;

const giftSchema = z.object({
  name: z.string().trim().min(1, "Gift name is required").max(80),
  description: z.string().trim().max(500),
  imageUrl: z.union([z.literal(""), z.httpUrl().max(1000)]),
  /** Naira figure the owner entered, if they priced the gift in naira. Display only. */
  targetNgn: z.number().positive().nullable(),
});

/** Link slug: readable title part + "-" + 12 random hex chars, e.g. "ada-and-tunde-2274681a67cd". */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{12}$/;

/**
 * Offchain registry details. Gift targets are NOT stored here: the contract is the single
 * source of truth for amounts. `gifts[i]` describes onchain gift id `i`.
 */
export const registryMetadataSchema = z.object({
  v: z.literal(2),
  /** Owner wallet (lowercase). Binding it into the hash stops copycats reusing the details. */
  owner: z.string().regex(/^0x[0-9a-f]{40}$/, "Invalid owner address"),
  /** Shareable link id, also bound into the hash so nobody can change or claim it. */
  slug: z.string().max(80).regex(SLUG_PATTERN, "Invalid link"),
  displayName: z.string().trim().min(1, "Your name is required").max(60),
  title: z.string().trim().min(1, "Title is required").max(100),
  description: z.string().trim().max(2000),
  occasion: z.enum(Object.keys(OCCASIONS) as [Occasion, ...Occasion[]]),
  /** Owner-stated naira per 1 USDC, used only to show naira equivalents. */
  ngnPerUsdc: z.number().positive().max(10_000_000).nullable(),
  gifts: z.array(giftSchema).max(50),
  createdAt: z.iso.datetime(),
});
export type RegistryMetadata = z.infer<typeof registryMetadataSchema>;
export type GiftMetadata = z.infer<typeof giftSchema>;

/**
 * The exact JSON string is what gets hashed and stored, so the hash can be re-checked by
 * anyone later. Never re-serialize parsed metadata before hashing.
 */
export function serializeMetadata(m: RegistryMetadata): string {
  return JSON.stringify(m);
}

export function hashMetadata(json: string): Hex {
  return keccak256(stringToHex(json));
}

export function parseMetadataJson(json: string): RegistryMetadata {
  return registryMetadataSchema.parse(JSON.parse(json));
}

/** Builds a link slug from the title plus 48 random bits, e.g. "ada-and-tundes-wedding-2274681a67cd". */
export function makeSlug(title: string): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/['\u2019]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50)
      .replace(/-+$/g, "") || "registry";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}-${random}`;
}
