-- ============================================================
-- NCAA Wrestling Fantasy Draft — Supabase Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- WEIGHT CLASSES
-- ============================================================
create table if not exists weight_classes (
  id        serial primary key,
  pounds    integer not null unique,
  label     text generated always as (pounds::text || ' lbs') stored
);

insert into weight_classes (pounds) values
  (125), (133), (141), (149), (157),
  (165), (174), (184), (197), (285)
on conflict do nothing;

-- ============================================================
-- OWNERS (draft participants)
-- ============================================================
create table if not exists owners (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  join_code    text unique not null,  -- simple 6-char code to join as this owner
  draft_order  integer unique,        -- 1-10, set when draft is locked
  is_commissioner boolean default false,
  created_at   timestamptz default now()
);

-- ============================================================
-- WRESTLERS
-- ============================================================
create table if not exists wrestlers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  school         text,
  weight_class   integer not null references weight_classes(pounds),
  seed           integer,            -- tournament seed (1-33)
  region         text,               -- bracket region if applicable
  -- Raw scoring data (updated by NCAA fetcher)
  round_results  jsonb default '[]'::jsonb,
  -- Computed totals (denormalized for fast reads)
  total_points   numeric(6,1) default 0,
  is_eliminated  boolean default false,
  last_updated   timestamptz,
  created_at     timestamptz default now()
);

create index idx_wrestlers_weight on wrestlers(weight_class);
create index idx_wrestlers_seed   on wrestlers(weight_class, seed);

-- ============================================================
-- DRAFT SESSION (one per app instance)
-- ============================================================
create table if not exists draft_session (
  id               integer primary key default 1,  -- singleton
  status           text not null default 'pending'
                   check (status in ('pending','active','complete')),
  current_pick     integer default 1,  -- pick number (1-100 for 10 owners x 10 classes)
  started_at       timestamptz,
  completed_at     timestamptz,
  pick_timer_secs  integer default 90,  -- seconds per pick (0 = no timer)
  constraint singleton check (id = 1)
);

insert into draft_session (id) values (1) on conflict do nothing;

-- ============================================================
-- PICKS
-- ============================================================
create table if not exists picks (
  id            uuid primary key default gen_random_uuid(),
  pick_number   integer not null,       -- sequential pick # in the draft
  owner_id      uuid not null references owners(id) on delete cascade,
  wrestler_id   uuid not null references wrestlers(id) on delete cascade,
  weight_class  integer not null references weight_classes(pounds),
  picked_at     timestamptz default now(),
  unique (owner_id, weight_class),      -- one pick per owner per weight class
  unique (wrestler_id)                   -- one owner per wrestler
);

create index idx_picks_owner   on picks(owner_id);
create index idx_picks_session on picks(pick_number);

-- ============================================================
-- SCORING EVENTS (audit trail for point assignments)
-- ============================================================
create table if not exists scoring_events (
  id           uuid primary key default gen_random_uuid(),
  wrestler_id  uuid not null references wrestlers(id) on delete cascade,
  round        text not null,    -- e.g. "R32", "R16", "QF", "SF", "3rd", "1st"
  result_type  text not null,    -- "fall", "tech_fall", "major", "decision", "bye", "medical_ff"
  opponent     text,
  points       numeric(4,1) not null,
  event_time   timestamptz,
  source       text default 'manual',  -- 'ncaa_scrape' | 'manual'
  created_at   timestamptz default now()
);

create index idx_events_wrestler on scoring_events(wrestler_id);

-- ============================================================
-- REALTIME
-- Enable realtime on tables needed for live draft & scoring
-- ============================================================
alter publication supabase_realtime add table picks;
alter publication supabase_realtime add table draft_session;
alter publication supabase_realtime add table wrestlers;
alter publication supabase_realtime add table owners;

-- ============================================================
-- VIEWS
-- ============================================================

-- Leaderboard: owner totals
create or replace view leaderboard as
select
  o.id          as owner_id,
  o.name        as owner_name,
  o.draft_order,
  count(p.id)   as picks_made,
  coalesce(sum(w.total_points), 0) as total_points
from owners o
left join picks p on p.owner_id = o.id
left join wrestlers w on w.id = p.wrestler_id
group by o.id, o.name, o.draft_order
order by total_points desc;

-- Draft board: all weight classes x owners
create or replace view draft_board as
select
  wc.pounds     as weight_class,
  o.id          as owner_id,
  o.name        as owner_name,
  o.draft_order,
  w.id          as wrestler_id,
  w.name        as wrestler_name,
  w.school,
  w.seed,
  w.total_points,
  w.is_eliminated,
  p.pick_number,
  p.picked_at
from weight_classes wc
cross join owners o
left join picks p on p.owner_id = o.id and p.weight_class = wc.pounds
left join wrestlers w on w.id = p.wrestler_id
order by wc.pounds, o.draft_order;

-- ============================================================
-- HELPER FUNCTION: compute pick owner for snake draft
-- pick_number 1-100, 10 owners
-- ============================================================
create or replace function snake_draft_owner(
  pick_num integer,
  total_owners integer default 10
)
returns integer language sql immutable as $$
  select case
    when ((pick_num - 1) / total_owners) % 2 = 0
    then ((pick_num - 1) % total_owners) + 1          -- forward
    else total_owners - ((pick_num - 1) % total_owners) -- reverse
  end;
$$;

-- ============================================================
-- RLS: Row Level Security
-- Simple setup — all reads are public, writes restricted
-- (For a private draft you'd tighten this with auth tokens)
-- ============================================================
alter table owners         enable row level security;
alter table wrestlers      enable row level security;
alter table draft_session  enable row level security;
alter table picks          enable row level security;
alter table scoring_events enable row level security;

-- Public read for everything
create policy "public read owners"         on owners         for select using (true);
create policy "public read wrestlers"      on wrestlers       for select using (true);
create policy "public read draft_session"  on draft_session   for select using (true);
create policy "public read picks"          on picks           for select using (true);
create policy "public read scoring_events" on scoring_events  for select using (true);

-- Insert/update allowed via service role key only (backend functions)
-- No anon inserts — picks go through backend API to enforce draft order
