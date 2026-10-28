-- Run once in the Supabase SQL Editor. All journal/token tables are private.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists zepimon_private;
revoke all on schema zepimon_private from public, anon, authenticated;

create table if not exists zepimon_private.links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash bytea unique,
  pair_hash bytea unique,
  pair_expires timestamptz,
  linked_at timestamptz
);
create table if not exists zepimon_private.journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
-- The plan Zepimon mobile shares with the watch: the egg chosen on the phone and any adventure it is recording.
create table if not exists zepimon_private.plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
-- Adventures recorded on Zepimon mobile, for the watch to add to its journal. seq orders them as they arrive, so the
-- watch can ask for the ones after the last it received even when a phone shares an older adventure late.
create table if not exists zepimon_private.phone_runs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  seq bigint generated always as identity,
  primary key (user_id, id)
);
create index if not exists phone_runs_seq on zepimon_private.phone_runs(user_id, seq);
-- The one adventure the phone and the watch share: who records it now, and its distance so far.
create table if not exists zepimon_private.adventures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table zepimon_private.links enable row level security;
alter table zepimon_private.journals enable row level security;
alter table zepimon_private.plans enable row level security;
alter table zepimon_private.phone_runs enable row level security;
alter table zepimon_private.adventures enable row level security;
revoke all on all tables in schema zepimon_private from public, anon, authenticated;

create or replace function zepimon_private.valid_name(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value is not null and length(value) between 1 and 80
    and value = btrim(value) and value !~ '[[:cntrl:]]'
    and value not in ('__proto__', 'prototype', 'constructor');
$$;

create or replace function zepimon_private.valid_record(value jsonb, active boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare field text; n numeric;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or jsonb_typeof(value->'meters') is distinct from 'number'
    or (value->>'meters')::numeric < 0
    or jsonb_typeof(value->'steps') is distinct from 'number'
    or (value->>'steps')::numeric not between 0 and 9007199254740991
    or trunc((value->>'steps')::numeric) <> (value->>'steps')::numeric then return false; end if;
  if value ? 'shiny' and jsonb_typeof(value->'shiny') <> 'boolean' then return false; end if;
  if not active then
    if jsonb_typeof(value->'finishedAt') is distinct from 'string' or length(value->>'finishedAt') > 32
      or not isfinite((value->>'finishedAt')::timestamptz) then return false; end if;
  end if;
  foreach field in array array['startedAt', 'elapsedSeconds', 'hatchSeconds'] loop
    if value ? field and value->field <> 'null'::jsonb then
      if jsonb_typeof(value->field) <> 'number' then return false; end if;
      n := (value->>field)::numeric;
      if n < 0 or (field = 'startedAt' and n > 8640000000000000) then return false; end if;
      if field = 'hatchSeconds' and (n <= 0 or (value->>'meters')::numeric < 5000
        or n > (value->>'elapsedSeconds')::numeric) then return false; end if;
    end if;
  end loop;
  if value->>'activity' is not null and value->>'activity' not in ('walking', 'running') then return false; end if;
  foreach field in array array['form', 'mega'] loop
    if value ? field and value->field <> 'null'::jsonb and
      (jsonb_typeof(value->field) <> 'string' or not zepimon_private.valid_name(value->>field)) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function zepimon_private.valid_journal(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare snapshot jsonb; route jsonb; entry record; route_count integer; route_id numeric; item jsonb;
begin
  if value is null or octet_length(value::text) > 2097152 or jsonb_typeof(value) <> 'object'
    or value->'exportVersion' is distinct from '1'::jsonb or value->>'app' is distinct from 'Zepimon'
    or jsonb_typeof(value->'exportedAt') is distinct from 'string'
    or length(value->>'exportedAt') > 32 or not isfinite((value->>'exportedAt')::timestamptz)
    or not (value ? 'receivedAt') then return false; end if;
  if value->'receivedAt' <> 'null'::jsonb and (jsonb_typeof(value->'receivedAt') <> 'number'
    or (value->>'receivedAt')::numeric not between 0 and 8640000000000000) then return false; end if;
  if jsonb_typeof(value->'routes') is distinct from 'array' then return false; end if;
  route_count := jsonb_array_length(value->'routes');
  if route_count not between 1 and 512 then return false; end if;
  for route in select * from jsonb_array_elements(value->'routes') loop
    if jsonb_typeof(route) <> 'array' or jsonb_array_length(route) not between 1 and 3 then return false; end if;
    if (select count(distinct v) from jsonb_array_elements(route) as t(v)) <> jsonb_array_length(route) then return false; end if;
    for item in select * from jsonb_array_elements(route) loop
      if jsonb_typeof(item) <> 'string' or not zepimon_private.valid_name(item #>> '{}') then return false; end if;
    end loop;
  end loop;
  snapshot := value->'snapshot';
  if jsonb_typeof(snapshot) is distinct from 'object' or snapshot->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(snapshot->'capturedAt') is distinct from 'number'
    or (snapshot->>'capturedAt')::numeric not between 0 and 8640000000000000
    or jsonb_typeof(snapshot->'dex') is distinct from 'object'
    or jsonb_typeof(snapshot->'records') is distinct from 'object' or not (snapshot ? 'active') then return false; end if;
  if (select count(*) from jsonb_object_keys(snapshot->'dex')) > 1400
    or (select count(*) from jsonb_object_keys(snapshot->'records')) > 512 then return false; end if;
  for entry in select * from jsonb_each(snapshot->'dex') loop
    if not zepimon_private.valid_name(entry.key) or not zepimon_private.valid_name(regexp_replace(entry.key, '^Shiny ', ''))
      or not zepimon_private.valid_record(entry.value) then return false; end if;
  end loop;
  for entry in select * from jsonb_each(snapshot->'records') loop
    if entry.key !~ '^(0|[1-9][0-9]{0,2})$' or entry.key::integer >= route_count
      or not zepimon_private.valid_record(entry.value) then return false; end if;
  end loop;
  if snapshot->'active' <> 'null'::jsonb then
    if not zepimon_private.valid_record(snapshot->'active', true)
      or jsonb_typeof(snapshot->'active'->'route') is distinct from 'number' then return false; end if;
    route_id := (snapshot->'active'->>'route')::numeric;
    if trunc(route_id) <> route_id or route_id < 0 or route_id >= route_count then return false; end if;
  end if;
  if snapshot ? 'personalBests' then
    if jsonb_typeof(snapshot->'personalBests') <> 'object' then return false; end if;
    for entry in select * from jsonb_each(snapshot->'personalBests') loop
      if entry.key not in ('distance', 'elapsed', 'hatch') or not zepimon_private.valid_record(entry.value)
        or jsonb_typeof(entry.value->'route') is distinct from 'number' then return false; end if;
      route_id := (entry.value->>'route')::numeric;
      if trunc(route_id) <> route_id or route_id < 0 or route_id >= route_count then return false; end if;
      if entry.key = 'elapsed' and coalesce((entry.value->>'elapsedSeconds')::numeric, 0) <= 0 then return false; end if;
      if entry.key = 'hatch' and (coalesce((entry.value->>'hatchSeconds')::numeric, 0) <= 0
        or coalesce((entry.value->>'elapsedSeconds')::numeric, 0) < (entry.value->>'hatchSeconds')::numeric) then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end;
$$;

-- One to three distinct Pokemon names, as in an egg's evolution family.
create or replace function zepimon_private.valid_family(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 3 then return false; end if;
  if (select count(distinct v) from jsonb_array_elements(value) as t(v)) <> jsonb_array_length(value) then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'string' or not zepimon_private.valid_name(item #>> '{}') then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

-- Matches validatePlan in hatdog-app/shared/companion.js. Times are milliseconds since 1970.
create or replace function zepimon_private.valid_plan(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare egg jsonb := value->'egg'; phone jsonb := value->'phone';
begin
  if value is null or octet_length(value::text) > 4096 or jsonb_typeof(value) <> 'object'
    or jsonb_typeof(value->'updatedAt') is distinct from 'number'
    or (value->>'updatedAt')::numeric not between 0 and 8640000000000000 then return false; end if;
  if egg is not null and egg <> 'null'::jsonb then
    if jsonb_typeof(egg) <> 'object' or not zepimon_private.valid_family(egg->'family')
      or (egg->'mega' is not null and egg->'mega' <> 'null'::jsonb
        and (jsonb_typeof(egg->'mega') <> 'string' or not zepimon_private.valid_name(egg->>'mega')))
      or jsonb_typeof(value->'eggAt') is distinct from 'number'
      or (value->>'eggAt')::numeric not between 0 and 8640000000000000 then return false; end if;
  end if;
  if phone is not null and phone <> 'null'::jsonb then
    if jsonb_typeof(phone) <> 'object' or not zepimon_private.valid_family(phone->'family')
      or coalesce(phone->>'activity', '') not in ('walking', 'running')
      or jsonb_typeof(phone->'startedAt') is distinct from 'number'
      or (phone->>'startedAt')::numeric not between 0 and 8640000000000000 then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

-- Matches validatePhoneRun in hatdog-app/shared/companion.js: an id from the phone, the egg's family and the saved
-- record, in the watch's own record format.
create or replace function zepimon_private.valid_phone_run(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  return value is not null and octet_length(value::text) <= 2048 and jsonb_typeof(value) = 'object'
    and jsonb_typeof(value->'id') = 'string' and value->>'id' ~ '^[A-Za-z0-9_-]{1,64}$'
    and zepimon_private.valid_family(value->'family') and zepimon_private.valid_record(value->'record');
exception when others then return false;
end;
$$;

-- Matches validateAdventure in hatdog-app/shared/companion.js. device records it now, since deviceAt (its start or
-- the moment it took over); meters is its distance as of at. Times are milliseconds since 1970.
create or replace function zepimon_private.valid_adventure(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare field text;
begin
  if value is null or octet_length(value::text) > 2048 or jsonb_typeof(value) <> 'object'
    or jsonb_typeof(value->'id') is distinct from 'string' or value->>'id' !~ '^[A-Za-z0-9_-]{1,64}$'
    or not zepimon_private.valid_family(value->'family')
    or coalesce(value->>'activity', '') not in ('walking', 'running')
    or coalesce(value->>'device', '') not in ('phone', 'watch')
    or jsonb_typeof(value->'shiny') is distinct from 'boolean' or jsonb_typeof(value->'ended') is distinct from 'boolean'
    or jsonb_typeof(value->'meters') is distinct from 'number' or (value->>'meters')::numeric not between 0 and 100000000 then return false; end if;
  foreach field in array array['startedAt', 'deviceAt', 'at'] loop
    if jsonb_typeof(value->field) is distinct from 'number' or (value->>field)::numeric not between 0 and 8640000000000000 then return false; end if;
  end loop;
  if value->'mega' is not null and value->'mega' <> 'null'::jsonb
    and (jsonb_typeof(value->'mega') <> 'string' or not zepimon_private.valid_name(value->>'mega')) then return false; end if;
  if value->'hatchSeconds' is not null and value->'hatchSeconds' <> 'null'::jsonb
    and (jsonb_typeof(value->'hatchSeconds') <> 'number' or (value->>'hatchSeconds')::numeric <= 0) then return false; end if;
  return true;
exception when others then return false;
end;
$$;

-- Keeps the shared adventure, from either device, and returns it as it now stands. A device's update is taken when
-- it starts a newer adventure (or the last one ended), takes the same adventure over (a newer deviceAt), or reports
-- progress on the adventure it still records. A device that was taken over gets the newer state back instead, which
-- tells it to stop. An ended adventure stays ended.
create or replace function zepimon_private.share_adventure(uid uuid, adventure jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old jsonb; same boolean; newer boolean;
begin
  if not zepimon_private.valid_adventure(adventure) then raise exception 'Invalid adventure'; end if;
  select payload into old from zepimon_private.adventures where user_id = uid for update;
  same := old is not null and old->>'id' = adventure->>'id';
  newer := old is null or (adventure->>'deviceAt')::numeric > (old->>'deviceAt')::numeric;
  if old is null
    or (not same and ((old->>'ended')::boolean or newer))
    or (same and not (old->>'ended')::boolean and (newer
      or (old->>'device' = adventure->>'device' and (adventure->>'deviceAt')::numeric = (old->>'deviceAt')::numeric
        and (adventure->>'at')::numeric >= (old->>'at')::numeric))) then
    insert into zepimon_private.adventures(user_id, payload) values(uid, adventure)
      on conflict(user_id) do update set payload = excluded.payload, updated_at = now();
    return adventure;
  end if;
  return old;
end;
$$;

-- A 96-bit, short-lived pairing code; only its hash is retained.
create or replace function public.zepimon_create_link()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); code text := encode(extensions.gen_random_bytes(12), 'hex'); expires timestamptz := now() + interval '10 minutes';
begin
  if uid is null then raise exception 'Sign in first'; end if;
  insert into zepimon_private.links(user_id, pair_hash, pair_expires)
    values(uid, extensions.digest(code, 'sha256'), expires)
    on conflict(user_id) do update set pair_hash = excluded.pair_hash, pair_expires = excluded.pair_expires;
  return jsonb_build_object('code', code, 'expiresAt', expires);
end;
$$;

-- Claiming rotates the upload-only token atomically and consumes the code.
create or replace function public.zepimon_claim_link(pair_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare code text := lower(regexp_replace(pair_code, '[[:space:]-]', '', 'g'));
  token text := encode(extensions.gen_random_bytes(32), 'hex'); uid uuid;
begin
  if code is null or code !~ '^[a-f0-9]{24}$' then raise exception 'Invalid or expired linking code'; end if;
  update zepimon_private.links set token_hash = extensions.digest(token, 'sha256'), linked_at = now(), pair_hash = null, pair_expires = null
    where pair_hash = extensions.digest(code, 'sha256') and pair_expires > now() returning user_id into uid;
  if uid is null then raise exception 'Invalid or expired linking code'; end if;
  return jsonb_build_object('token', token);
end;
$$;

create or replace function public.zepimon_upload(upload_token text, journal jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid; old jsonb; merged jsonb;
begin
  if upload_token is null or upload_token !~ '^[a-f0-9]{64}$' then raise exception 'Watch link expired. Link again.'; end if;
  -- Serializes upload, replacement and revocation for the same account.
  select user_id into uid from zepimon_private.links
    where token_hash = extensions.digest(upload_token, 'sha256') for update;
  if uid is null then raise exception 'Watch link expired. Link again.'; end if;
  if not zepimon_private.valid_journal(journal) then raise exception 'Invalid journal'; end if;
  if (journal->'snapshot'->>'capturedAt')::numeric > extract(epoch from now()) * 1000 + 300000 then
    raise exception 'Watch clock is ahead. Correct the time and sync again.';
  end if;
  select payload into old from zepimon_private.journals where user_id = uid;
  if old is not null and (journal->'snapshot'->>'capturedAt')::numeric <= (old->'snapshot'->>'capturedAt')::numeric then
    return jsonb_build_object('accepted', false, 'reason', 'not_newer');
  end if;
  merged := journal;
  if old is not null then
    -- A reset watch must not erase previously collected normal/shiny species.
    merged := jsonb_set(merged, '{snapshot,dex}', (old->'snapshot'->'dex') || (journal->'snapshot'->'dex'));
    if not zepimon_private.valid_journal(merged) then raise exception 'Merged journal exceeds supported limits'; end if;
  end if;
  insert into zepimon_private.journals(user_id, payload) values(uid, merged)
    on conflict(user_id) do update set payload = excluded.payload, updated_at = now();
  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.zepimon_pull()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  select jsonb_build_object('journal', payload, 'updatedAt', updated_at) into result
    from zepimon_private.journals where user_id = uid;
  return coalesce(result, '{"journal":null,"updatedAt":null}'::jsonb) || jsonb_build_object('linked',
    exists(select 1 from zepimon_private.links where user_id = uid and token_hash is not null),
    'plan', (select payload from zepimon_private.plans where user_id = uid),
    'adventure', (select payload from zepimon_private.adventures where user_id = uid));
end;
$$;

-- Zepimon mobile shares the adventure it records (or ends, or takes over) and gets the shared one back.
create or replace function public.zepimon_share_adventure(adventure jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  return jsonb_build_object('adventure', zepimon_private.share_adventure(auth.uid(), adventure));
end;
$$;

-- The shared adventure and plan alone, which Zepimon mobile checks often while it is open; zepimon_pull also carries
-- the whole journal.
create or replace function public.zepimon_get_shared()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  return jsonb_build_object('plan', (select payload from zepimon_private.plans where user_id = uid),
    'adventure', (select payload from zepimon_private.adventures where user_id = uid));
end;
$$;

-- The same for the watch, through its Zepp service and upload token.
create or replace function public.zepimon_watch_share_adventure(upload_token text, adventure jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if upload_token is null or upload_token !~ '^[a-f0-9]{64}$' then raise exception 'Watch link expired. Link again.'; end if;
  select user_id into uid from zepimon_private.links where token_hash = extensions.digest(upload_token, 'sha256');
  if uid is null then raise exception 'Watch link expired. Link again.'; end if;
  return jsonb_build_object('adventure', zepimon_private.share_adventure(uid, adventure));
end;
$$;

-- Zepimon mobile saves the plan it shares with the watch. An older plan (a delayed request, another phone) cannot
-- replace a newer one.
create or replace function public.zepimon_set_plan(plan jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); old jsonb;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if not zepimon_private.valid_plan(plan) then raise exception 'Invalid plan'; end if;
  select payload into old from zepimon_private.plans where user_id = uid for update;
  if old is not null and (plan->>'updatedAt')::numeric <= (old->>'updatedAt')::numeric then
    return jsonb_build_object('accepted', false, 'reason', 'not_newer');
  end if;
  insert into zepimon_private.plans(user_id, payload) values(uid, plan)
    on conflict(user_id) do update set payload = excluded.payload, updated_at = now();
  return jsonb_build_object('accepted', true);
end;
$$;

-- The watch's Zepp service reads the plan and the shared adventure with its upload token, which can read nothing else.
create or replace function public.zepimon_get_plan(upload_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if upload_token is null or upload_token !~ '^[a-f0-9]{64}$' then raise exception 'Watch link expired. Link again.'; end if;
  select user_id into uid from zepimon_private.links where token_hash = extensions.digest(upload_token, 'sha256');
  if uid is null then raise exception 'Watch link expired. Link again.'; end if;
  return jsonb_build_object('plan', (select payload from zepimon_private.plans where user_id = uid),
    'adventure', (select payload from zepimon_private.adventures where user_id = uid));
end;
$$;

-- Zepimon mobile shares the adventures it saved. Sharing one again changes nothing, and an invalid one is skipped so
-- it cannot hold back the rest. The newest 500 are kept.
create or replace function public.zepimon_add_phone_runs(runs jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); run jsonb; added integer := 0; skipped integer := 0; n integer;
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if jsonb_typeof(runs) is distinct from 'array' or jsonb_array_length(runs) > 50 then raise exception 'Invalid adventures'; end if;
  for run in select * from jsonb_array_elements(runs) loop
    if not zepimon_private.valid_phone_run(run) then skipped := skipped + 1; continue; end if;
    insert into zepimon_private.phone_runs(user_id, id, payload) values(uid, run->>'id', run) on conflict do nothing;
    get diagnostics n = row_count;
    added := added + n;
  end loop;
  delete from zepimon_private.phone_runs where user_id = uid and seq in
    (select seq from zepimon_private.phone_runs where user_id = uid order by seq desc offset 500);
  return jsonb_build_object('added', added, 'skipped', skipped);
end;
$$;

-- The watch's Zepp service reads the phone's adventures after the last one it received (seq), oldest first, 30 at a
-- time, with its upload token.
create or replace function public.zepimon_get_phone_runs(upload_token text, after bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid;
begin
  if upload_token is null or upload_token !~ '^[a-f0-9]{64}$' then raise exception 'Watch link expired. Link again.'; end if;
  select user_id into uid from zepimon_private.links where token_hash = extensions.digest(upload_token, 'sha256');
  if uid is null then raise exception 'Watch link expired. Link again.'; end if;
  return jsonb_build_object('runs', coalesce((select jsonb_agg(payload || jsonb_build_object('seq', seq) order by seq)
    from (select payload, seq from zepimon_private.phone_runs where user_id = uid and seq > coalesce(after, 0)
      order by seq limit 30) as waiting), '[]'::jsonb));
end;
$$;

create or replace function public.zepimon_unlink()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update zepimon_private.links set token_hash = null, pair_hash = null, pair_expires = null where user_id = auth.uid();
end;
$$;

revoke all on all functions in schema zepimon_private from public, anon, authenticated;
revoke all on function public.zepimon_create_link(), public.zepimon_claim_link(text), public.zepimon_upload(text,jsonb), public.zepimon_pull(), public.zepimon_unlink(),
  public.zepimon_set_plan(jsonb), public.zepimon_get_plan(text), public.zepimon_add_phone_runs(jsonb), public.zepimon_get_phone_runs(text,bigint),
  public.zepimon_share_adventure(jsonb), public.zepimon_watch_share_adventure(text,jsonb), public.zepimon_get_shared()
  from public, anon, authenticated;
grant execute on function public.zepimon_create_link(), public.zepimon_pull(), public.zepimon_unlink(), public.zepimon_set_plan(jsonb),
  public.zepimon_add_phone_runs(jsonb), public.zepimon_share_adventure(jsonb), public.zepimon_get_shared() to authenticated;
grant execute on function public.zepimon_claim_link(text), public.zepimon_upload(text,jsonb), public.zepimon_get_plan(text),
  public.zepimon_get_phone_runs(text,bigint), public.zepimon_watch_share_adventure(text,jsonb) to anon;
commit;
