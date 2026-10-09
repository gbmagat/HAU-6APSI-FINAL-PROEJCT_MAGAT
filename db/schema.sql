-- Our Places: fresh PostgreSQL 13+ database only. Run once against an empty app database.
-- The server owns all database access; browsers never connect to PostgreSQL.
-- Provision the two users and their membership separately. Never put passwords here.
begin;

create table app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  password_hash text not null check (char_length(password_hash) >= 50),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  failed_login_count integer not null default 0 check (failed_login_count >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

-- Store only a server-computed SHA-256 hash of each random session token.
-- Send the raw token to the browser only in a Secure, HttpOnly, SameSite cookie.
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);
create index user_sessions_user_expiry_idx on user_sessions (user_id, expires_at);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100)
);

-- One owner and one partner per space; a user belongs to at most one space.
create table space_members (
  space_id uuid not null references spaces(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'partner')),
  primary key (space_id, user_id),
  unique (user_id),
  unique (space_id, role)
);

-- One-time links that let a space's owner invite the second member. Only a SHA-256 hash of the
-- random token is stored; the link itself is shown once to the owner.
create table space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  check (expires_at > created_at)
);
create index space_invites_space_idx on space_invites (space_id);

-- A place is one canonical location; many dated visits may link to it.
create table places (
  id text primary key check (char_length(id) between 1 and 80),
  space_id uuid not null references spaces(id) on delete cascade,
  slug text not null check (char_length(slug) between 1 and 120),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category text not null check (category in
    ('Museum', 'Cafe', 'Restaurant', 'Park', 'Heritage', 'District', 'Gallery', 'Walk')),
  address text not null default '',
  city text not null default '',
  country text not null default 'Philippines' check (char_length(btrim(country)) between 1 and 80),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  initials text not null default '',
  short_description text not null default '',
  opening_note text,
  status text not null default 'want-to-visit'
    check (status in ('want-to-visit', 'planned', 'visited')),
  planned_for date,
  -- A planned visit: optional time and note, and when to email both members about it (Asia/Manila).
  planned_time time,
  plan_note text not null default '' check (char_length(plan_note) <= 200),
  plan_reminder text not null default 'none'
    check (plan_reminder in ('none', 'morning', 'day-before', 'week-before')),
  remind_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (space_id, id),
  unique (space_id, slug)
);
create index places_space_name_idx on places (space_id, name);
create index places_due_reminder_idx on places (remind_at) where reminder_sent_at is null;

-- Favorites belong to a member; the place's visit status is shared by the space.
create table member_favorites (
  space_id uuid not null,
  user_id uuid not null,
  place_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id),
  foreign key (space_id, user_id) references space_members(space_id, user_id) on delete cascade,
  foreign key (space_id, place_id) references places(space_id, id) on delete cascade
);

create table visits (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  place_id text not null,
  author_id uuid not null,
  visited_on date not null check (isfinite(visited_on) and visited_on >= date '0001-01-01'),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  exhibition text not null default '',
  story text not null check (char_length(btrim(story)) between 20 and 1200),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  -- When the other member was emailed that their review is waiting (or null if not yet).
  review_reminder_sent_at timestamptz,
  unique (space_id, id),
  unique (author_id, idempotency_key),
  foreign key (space_id, place_id) references places(space_id, id),
  foreign key (space_id, author_id) references space_members(space_id, user_id)
);
create index visits_space_created_idx on visits (space_id, created_at desc);
create index visits_place_idx on visits (space_id, place_id, created_at desc);
create index visits_review_reminder_idx on visits (created_at) where review_reminder_sent_at is null;

-- One final, independent review per member per visit. The server must not return
-- the partner's review until both members have submitted their own reviews.
create table reviews (
  space_id uuid not null,
  visit_id uuid not null,
  author_id uuid not null,
  overall integer not null check (overall between 1 and 5),
  reflection text not null check (char_length(btrim(reflection)) between 8 and 500),
  would_visit_again text not null check (would_visit_again in ('yes', 'maybe', 'no')),
  submitted_at timestamptz not null default now(),
  primary key (visit_id, author_id),
  foreign key (space_id, visit_id) references visits(space_id, id) on delete cascade,
  foreign key (space_id, author_id) references space_members(space_id, user_id)
);

-- This view deliberately reveals no combined score before both reviews exist.
-- It does not authorize individual review rows; apply the rule above in API reads.
create view visit_review_summary as
select
  v.id as visit_id,
  v.space_id,
  count(r.author_id)::integer as review_count,
  case when count(r.author_id) = 2
    then round(avg(r.overall)::numeric, 1)
    else null
  end as combined_score
from visits v
left join reviews r on r.visit_id = v.id
group by v.id, v.space_id;

create table comments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  visit_id uuid not null,
  author_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  foreign key (space_id, visit_id) references visits(space_id, id) on delete cascade,
  foreign key (space_id, author_id) references space_members(space_id, user_id)
);
create index comments_visit_created_idx on comments (visit_id, created_at);

-- A member can have one active reaction on a visit; deleting it toggles it off.
create table reactions (
  space_id uuid not null,
  visit_id uuid not null,
  author_id uuid not null,
  type text not null check (type in ('like', 'love', 'insightful', 'surprised')),
  created_at timestamptz not null default now(),
  primary key (visit_id, author_id),
  foreign key (space_id, visit_id) references visits(space_id, id) on delete cascade,
  foreign key (space_id, author_id) references space_members(space_id, user_id)
);

-- Only metadata lives in PostgreSQL. Store files outside the public web root;
-- generate storage keys on the server and strip image location metadata first.
create table visit_photos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null,
  visit_id uuid not null,
  storage_key text not null unique,
  alt_text text not null default '' check (char_length(alt_text) <= 240),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now(),
  foreign key (space_id, visit_id) references visits(space_id, id) on delete cascade
);
create index visit_photos_visit_idx on visit_photos (visit_id, created_at);

create table member_settings (
  space_id uuid not null,
  user_id uuid primary key,
  review_reminders boolean not null default true,
  location_enabled boolean not null default false,
  plan_reminders boolean not null default true,
  foreign key (space_id, user_id) references space_members(space_id, user_id) on delete cascade
);

commit;
