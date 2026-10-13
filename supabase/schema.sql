-- Gift Registry offchain schema. Run once in the Supabase SQL editor.
-- Amounts and ownership live onchain; these tables only hold descriptive data that the
-- API verified against Arc before inserting.

create table if not exists public.registries (
  chain_id          integer     not null,
  contract_address  text        not null,
  registry_id       bigint      not null,
  slug              text        not null,  -- shareable link id, also inside metadata_json (hashed)
  owner             text        not null,
  metadata_json     text        not null,  -- exact string whose keccak256 is stored onchain
  metadata_hash     text        not null,
  created_at        timestamptz not null default now(),
  primary key (chain_id, contract_address, registry_id)
);

create unique index if not exists registries_slug_idx
  on public.registries (chain_id, contract_address, slug);

create table if not exists public.contributions (
  chain_id          integer     not null,
  contract_address  text        not null,
  registry_id       bigint      not null,
  tx_hash           text        not null,
  log_index         integer     not null,
  gift_id           text        not null,  -- 'general' or gift index
  contributor       text        not null,
  amount            text        not null,  -- USDC base units (6 decimals) from the onchain event
  block_number      bigint      not null,
  name              text        not null default '',
  message           text        not null default '',
  created_at        timestamptz not null default now(),
  primary key (chain_id, contract_address, tx_hash, log_index)
);

create index if not exists contributions_registry_idx
  on public.contributions (chain_id, contract_address, registry_id, block_number desc);

-- The app only talks to these tables from server-side API routes using the service-role key.
-- Enable RLS with no policies so the public anon key cannot read or write them directly.
alter table public.registries enable row level security;
alter table public.contributions enable row level security;
