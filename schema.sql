-- Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.keys (
  id uuid primary key default gen_random_uuid(),
  key_value text not null unique,
  status text not null default 'available' check (status in ('available','used')),
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.keys(id),
  key_value text not null,
  device_hash text not null,
  device_label text,
  claimed_at timestamptz not null default now()
);

create index if not exists claims_device_time_idx on public.claims(device_hash, claimed_at desc);
create index if not exists keys_status_created_idx on public.keys(status, created_at);

alter table public.admin_users enable row level security;
alter table public.keys enable row level security;
alter table public.claims enable row level security;

drop policy if exists "Admins read own admin record" on public.admin_users;
create policy "Admins read own admin record" on public.admin_users
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins manage keys" on public.keys;
create policy "Admins manage keys" on public.keys
for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Admins read claims" on public.claims;
create policy "Admins read claims" on public.claims
for select to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

-- Atomic claim: concurrent requests cannot receive the same key.
create or replace function public.claim_key(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_count integer;
  v_key public.keys%rowtype;
begin
  if p_device_id is null or length(p_device_id) < 16 or length(p_device_id) > 200 then
    return jsonb_build_object('ok', false, 'message', 'Mã thiết bị không hợp lệ.', 'remaining', 0);
  end if;

  v_hash := encode(digest(p_device_id, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  select count(*) into v_count
  from public.claims
  where device_hash = v_hash
    and claimed_at > now() - interval '24 hours';

  if v_count >= 2 then
    return jsonb_build_object('ok', false, 'message', 'Thiết bị đã đạt giới hạn 2 Key trong 24 giờ.', 'remaining', 0);
  end if;

  select * into v_key
  from public.keys
  where status = 'available'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Kho hiện không còn Key.', 'remaining', 2 - v_count);
  end if;

  update public.keys set status = 'used', used_at = now() where id = v_key.id;
  insert into public.claims(key_id, key_value, device_hash, device_label)
  values (v_key.id, v_key.key_value, v_hash, 'Thiết bị');

  return jsonb_build_object('ok', true, 'key', v_key.key_value, 'remaining', 1 - v_count);
end;
$$;

create or replace function public.get_my_claim_status(p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_count integer; v_hash text;
begin
  if p_device_id is null or length(p_device_id) < 16 or length(p_device_id) > 200 then
    return jsonb_build_object('remaining', 0);
  end if;
  v_hash := encode(digest(p_device_id, 'sha256'), 'hex');
  select count(*) into v_count from public.claims
  where device_hash = v_hash and claimed_at > now() - interval '24 hours';
  return jsonb_build_object('remaining', greatest(0, 2 - v_count));
end;
$$;

revoke all on function public.claim_key(text) from public;
grant execute on function public.claim_key(text) to anon, authenticated;
revoke all on function public.get_my_claim_status(text) from public;
grant execute on function public.get_my_claim_status(text) to anon, authenticated;

-- IMPORTANT: after creating an Admin user in Supabase Authentication,
-- replace the email below and run this statement to grant admin access:
-- insert into public.admin_users(user_id)
-- select id from auth.users where email = 'admin@example.com'
-- on conflict do nothing;

-- Optional: do not expose raw keys to anonymous visitors.
revoke all on public.keys from anon;
revoke all on public.claims from anon;
