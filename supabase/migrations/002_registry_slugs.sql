-- Run once in the Supabase SQL editor if you already ran the original schema.sql.
-- Adds shareable link slugs. Rows created before this change have no slug (they belong to
-- the previous contract version), so they and their contribution notes are removed.
alter table public.registries add column if not exists slug text;

delete from public.contributions c
  using public.registries r
  where r.slug is null
    and c.chain_id = r.chain_id
    and c.contract_address = r.contract_address
    and c.registry_id = r.registry_id;

delete from public.registries where slug is null;

alter table public.registries alter column slug set not null;

create unique index if not exists registries_slug_idx
  on public.registries (chain_id, contract_address, slug);
