-- Adds one-time partner invite links to a database created from an older db/schema.sql.
-- Safe to run more than once.
begin;

create table if not exists space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists space_invites_space_idx on space_invites (space_id);

commit;
