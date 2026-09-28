-- ===========================================================================
-- Maison (bag-wardrobe-analyzer)
-- Migration: make the app safe for many unrelated people to use.
--
-- WHAT THIS FILE DOES, IN PLAIN LANGUAGE
--   1. Creates a "bags" table - one row per handbag, stamped with the id of
--      the person who owns it.
--   2. Creates an "analysis_usage" table - a simple per-person, per-day
--      counter used to stop anyone running up the Claude bill.
--   3. Turns on Row Level Security (RLS) and adds owner-only rules, so the
--      database itself refuses to hand someone else's rows to you.
--   4. Grants table permissions by hand. This project has "Automatically
--      expose new tables" switched OFF, so nothing is readable through the
--      API until we say so here. Signed-out visitors (the "anon" role) are
--      granted nothing at all.
--   5. Creates a PRIVATE storage bucket for bag photos with the same
--      owner-only rules.
--
-- Safe to run more than once.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. Extension that gives us random ids
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------------
-- 1. THE BAGS TABLE
--    user_id points at Supabase's built-in list of accounts. "on delete
--    cascade" means if an account is deleted, its bags go with it.
-- ---------------------------------------------------------------------------
create table if not exists public.bags (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  name                text,
  brand               text,
  model               text,
  condition           text not null default 'good',
  purchase_price      numeric(12,2),
  purchase_date       date,
  estimated_value     numeric(12,2),
  valuation_reasoning text,
  market_trend        text,
  confidence          text,
  photo_path          text,          -- path inside the private bag-photos bucket
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists bags_user_id_idx on public.bags (user_id);

-- Keep updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bags_set_updated_at on public.bags;
create trigger bags_set_updated_at
  before update on public.bags
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 2. THE DAILY USAGE COUNTER
--    One row per person per day. Both Edge Functions share this counter.
-- ---------------------------------------------------------------------------
create table if not exists public.analysis_usage (
  user_id        uuid not null references auth.users (id) on delete cascade,
  usage_date     date not null default (now() at time zone 'utc')::date,
  analyses_count integer not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, usage_date)
);


-- ---------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY: "you can only touch your own rows"
-- ---------------------------------------------------------------------------
alter table public.bags           enable row level security;
alter table public.analysis_usage enable row level security;

-- --- bags -------------------------------------------------------------------
drop policy if exists bags_select_own on public.bags;
create policy bags_select_own on public.bags
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists bags_insert_own on public.bags;
create policy bags_insert_own on public.bags
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists bags_update_own on public.bags;
create policy bags_update_own on public.bags
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists bags_delete_own on public.bags;
create policy bags_delete_own on public.bags
  for delete to authenticated
  using (auth.uid() = user_id);

-- --- analysis_usage ---------------------------------------------------------
-- People may LOOK at their own counter (so the app can say "3 of 15 used")
-- but they may not change it. Only the function in section 5 writes to it.
drop policy if exists analysis_usage_select_own on public.analysis_usage;
create policy analysis_usage_select_own on public.analysis_usage
  for select to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- 4. TABLE PERMISSIONS (needed because "Automatically expose new tables"
--    is OFF for this project).
--
--    RLS decides WHICH ROWS you may touch.
--    These grants decide WHICH OPERATIONS exist at all.
--    Signed-out visitors (anon) deliberately get nothing.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

revoke all on table public.bags           from anon, authenticated;
revoke all on table public.analysis_usage from anon, authenticated;

grant select, insert, update, delete on table public.bags to authenticated;
grant select                         on table public.analysis_usage to authenticated;


-- ---------------------------------------------------------------------------
-- 5. THE DAILY LIMIT, ENFORCED INSIDE THE DATABASE
--
--    consume_analysis_credit() is called by the Edge Functions using the
--    signed-in person's own token. It works out who you are from auth.uid(),
--    so you cannot ask it to spend somebody else's allowance.
--
--    It is "security definer", meaning it is allowed to write to the counter
--    table even though ordinary users are not.
-- ---------------------------------------------------------------------------
create or replace function public.consume_analysis_credit(p_limit integer)
returns table (allowed boolean, used integer, daily_limit integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  if p_limit is null or p_limit < 0 then
    raise exception 'Invalid limit.' using errcode = '22023';
  end if;

  insert into public.analysis_usage (user_id, usage_date, analyses_count)
  values (v_user, v_today, 0)
  on conflict (user_id, usage_date) do nothing;

  select analyses_count into v_used
    from public.analysis_usage
   where user_id = v_user and usage_date = v_today
     for update;

  if v_used >= p_limit then
    return query select false, v_used, p_limit;
    return;
  end if;

  update public.analysis_usage
     set analyses_count = analyses_count + 1,
         updated_at     = now()
   where user_id = v_user and usage_date = v_today
  returning analyses_count into v_used;

  return query select true, v_used, p_limit;
end;
$$;

-- If the call to Claude fails, we hand the credit back.
create or replace function public.refund_analysis_credit()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_user is null then
    return;
  end if;

  update public.analysis_usage
     set analyses_count = greatest(analyses_count - 1, 0),
         updated_at     = now()
   where user_id = v_user and usage_date = v_today;
end;
$$;

-- Only signed-in people may call these. Signed-out visitors may not.
revoke all on function public.consume_analysis_credit(integer) from public, anon;
revoke all on function public.refund_analysis_credit()         from public, anon;

grant execute on function public.consume_analysis_credit(integer) to authenticated;
grant execute on function public.refund_analysis_credit()         to authenticated;


-- ---------------------------------------------------------------------------
-- 6. PRIVATE PHOTO STORAGE
--
--    The bucket is NOT public: photos are only reachable through short-lived
--    signed links that Supabase creates for the owner.
--
--    Every file must be stored as  <your-user-id>/<something>.<ext>
--    The policies below check that first folder name against your user id,
--    which is what stops one person reaching another person's photos.
--
--    NOTE: if your SQL editor replies "must be owner of table objects" for
--    this section, create the same four rules in the dashboard instead:
--    Storage > bag-photos > Policies.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bag-photos',
  'bag-photos',
  false,
  5242880,                                   -- 5 MB per photo
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bag_photos_select_own on storage.objects;
create policy bag_photos_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bag-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bag_photos_insert_own on storage.objects;
create policy bag_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bag-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bag_photos_update_own on storage.objects;
create policy bag_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'bag-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'bag-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists bag_photos_delete_own on storage.objects;
create policy bag_photos_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'bag-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ---------------------------------------------------------------------------
-- 7. Tell the API layer about the new tables straight away.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
