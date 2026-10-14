import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Offchain data. Every row is keyed by (chain_id, contract_address, registry_id) so data
// from a different deployment can never be mixed in.

export type RegistryRow = {
  chain_id: number;
  contract_address: string;
  registry_id: number;
  slug: string;
  owner: string;
  metadata_json: string;
  metadata_hash: string;
  created_at?: string;
};

export type ContributionRow = {
  chain_id: number;
  contract_address: string;
  registry_id: number;
  tx_hash: string;
  log_index: number;
  gift_id: string; // "general" or the gift index
  contributor: string;
  amount: string; // USDC base units, copied from the verified onchain event
  block_number: number;
  name: string;
  message: string;
  created_at?: string;
};

type Key = { chain_id: number; contract_address: string; registry_id: number };
type SlugKey = { chain_id: number; contract_address: string; slug: string };
type OwnerKey = { chain_id: number; contract_address: string; owner: string };

/** Thrown when a different registry already uses the requested link. */
export class SlugTakenError extends Error {
  constructor() {
    super("That registry link is already in use");
  }
}

export interface Store {
  getRegistry(key: Key): Promise<RegistryRow | null>;
  getRegistryBySlug(key: SlugKey): Promise<RegistryRow | null>;
  /**
   * Saves chain-verified details. Overwrites an existing row, which can only be stale
   * (e.g. a local chain was reset), because callers verify the hash against the chain first.
   */
  saveRegistry(row: RegistryRow): Promise<void>;
  /** Registries whose stored owner (lowercase) matches, newest first. */
  listRegistriesByOwner(key: OwnerKey): Promise<RegistryRow[]>;
  /** Updates the stored owner after an onchain ownership transfer. No-op if the row doesn't exist. */
  setRegistryOwner(key: Key, owner: string): Promise<void>;
  listContributions(key: Key): Promise<ContributionRow[]>;
  insertContributions(rows: ContributionRow[]): Promise<void>;
}

class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  async getRegistry(key: Key) {
    const { data, error } = await this.db.from("registries").select("*").match(key).maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    return data as RegistryRow | null;
  }

  async getRegistryBySlug(key: SlugKey) {
    const { data, error } = await this.db.from("registries").select("*").match(key).maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    return data as RegistryRow | null;
  }

  async saveRegistry(row: RegistryRow) {
    const { error } = await this.db
      .from("registries")
      .upsert(row, { onConflict: "chain_id,contract_address,registry_id" });
    if (error?.code === "23505") throw new SlugTakenError(); // unique slug index
    if (error) throw new Error(`Database error: ${error.message}`);
  }

  async listRegistriesByOwner(key: OwnerKey) {
    const { data, error } = await this.db
      .from("registries")
      .select("*")
      .match(key)
      .order("registry_id", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Database error: ${error.message}`);
    return data as RegistryRow[];
  }

  async setRegistryOwner(key: Key, owner: string) {
    const { error } = await this.db.from("registries").update({ owner }).match(key);
    if (error) throw new Error(`Database error: ${error.message}`);
  }

  async listContributions(key: Key) {
    const { data, error } = await this.db
      .from("contributions")
      .select("*")
      .match(key)
      .order("block_number", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Database error: ${error.message}`);
    return data as ContributionRow[];
  }

  async insertContributions(rows: ContributionRow[]) {
    const { error } = await this.db
      .from("contributions")
      .upsert(rows, { onConflict: "chain_id,contract_address,tx_hash,log_index", ignoreDuplicates: true });
    if (error) throw new Error(`Database error: ${error.message}`);
  }
}

/** Local-development fallback so the app runs without a Supabase project. Not for production. */
class FileStore implements Store {
  private file = path.join(process.cwd(), ".data", "dev-db.json");

  private async load(): Promise<{ registries: RegistryRow[]; contributions: ContributionRow[] }> {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      return { registries: [], contributions: [] };
    }
  }

  private async save(data: { registries: RegistryRow[]; contributions: ContributionRow[] }) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data, null, 2));
  }

  private static same(a: Key, b: Key) {
    return a.chain_id === b.chain_id && a.contract_address === b.contract_address && a.registry_id === b.registry_id;
  }

  async getRegistry(key: Key) {
    return (await this.load()).registries.find((r) => FileStore.same(r, key)) ?? null;
  }

  async getRegistryBySlug(key: SlugKey) {
    return (
      (await this.load()).registries.find(
        (r) => r.chain_id === key.chain_id && r.contract_address === key.contract_address && r.slug === key.slug,
      ) ?? null
    );
  }

  async saveRegistry(row: RegistryRow) {
    const data = await this.load();
    const clash = data.registries.find(
      (r) =>
        r.chain_id === row.chain_id && r.contract_address === row.contract_address && r.slug === row.slug && !FileStore.same(r, row),
    );
    if (clash) throw new SlugTakenError();
    data.registries = data.registries.filter((r) => !FileStore.same(r, row));
    data.registries.push({ ...row, created_at: new Date().toISOString() });
    await this.save(data);
  }

  async listRegistriesByOwner(key: OwnerKey) {
    return (await this.load()).registries
      .filter((r) => r.chain_id === key.chain_id && r.contract_address === key.contract_address && r.owner === key.owner)
      .sort((a, b) => b.registry_id - a.registry_id);
  }

  async setRegistryOwner(key: Key, owner: string) {
    const data = await this.load();
    const row = data.registries.find((r) => FileStore.same(r, key));
    if (!row) return;
    row.owner = owner;
    await this.save(data);
  }

  async listContributions(key: Key) {
    return (await this.load()).contributions
      .filter((c) => FileStore.same(c, key))
      .sort((a, b) => b.block_number - a.block_number);
  }

  async insertContributions(rows: ContributionRow[]) {
    const data = await this.load();
    for (const row of rows) {
      const exists = data.contributions.some(
        (c) => FileStore.same(c, row) && c.tx_hash === row.tx_hash && c.log_index === row.log_index,
      );
      if (!exists) data.contributions.push({ ...row, created_at: new Date().toISOString() });
    }
    await this.save(data);
  }
}

let store: Store | undefined;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    store = new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  } else if (process.env.NODE_ENV !== "production") {
    store = new FileStore();
  } else {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  }
  return store;
}
