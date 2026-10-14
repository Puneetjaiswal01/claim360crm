create table public.crm_usage_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 auth_session_id uuid not null,
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 ended_at timestamptz,
 check(last_seen_at >= started_at),
 check(ended_at is null or ended_at >= started_at)
);
create unique index crm_usage_active on public.crm_usage_sessions(user_id,auth_session_id) where ended_at is null;
create index crm_usage_user_time on public.crm_usage_sessions(user_id,started_at);
alter table public.crm_usage_sessions enable row level security;
create policy usage_read_own on public.crm_usage_sessions for select to authenticated using(user_id=(select auth.uid()));
create policy usage_insert_own on public.crm_usage_sessions for insert to authenticated with check(user_id=(select auth.uid()) and auth_session_id=((select auth.jwt())->>'session_id')::uuid);
create policy usage_update_own on public.crm_usage_sessions for update to authenticated using(user_id=(select auth.uid()) and auth_session_id=((select auth.jwt())->>'session_id')::uuid) with check(user_id=(select auth.uid()) and auth_session_id=((select auth.jwt())->>'session_id')::uuid);
grant select,insert,update on public.crm_usage_sessions to authenticated;
revoke all on public.crm_usage_sessions from anon;
create function public.crm_usage_tick(p_end boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 u uuid:=auth.uid(); sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
 n timestamptz:=now(); midnight timestamptz:=date_trunc('day',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
 r public.crm_usage_sessions%rowtype; total numeric;
begin
 if u is null or sid is null then raise exception 'Authenticated session required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||sid::text,0));
 select * into r from public.crm_usage_sessions where user_id=u and auth_session_id=sid and ended_at is null;
 if r.id is not null and r.last_seen_at < n-interval '90 seconds' then
  update public.crm_usage_sessions set ended_at=last_seen_at where id=r.id;
  r.id:=null;
 end if;
 if not p_end then
  if r.id is null then
   insert into public.crm_usage_sessions(user_id,auth_session_id,started_at,last_seen_at) values(u,sid,n,n) returning * into r;
  else
   update public.crm_usage_sessions set last_seen_at=n where id=r.id returning * into r;
  end if;
 elsif r.id is not null then
  update public.crm_usage_sessions set last_seen_at=n,ended_at=n where id=r.id returning * into r;
 end if;
 with intervals as (
  select tstzrange(greatest(started_at,midnight),least(coalesce(ended_at,last_seen_at),n),'[)') span
  from public.crm_usage_sessions where user_id=u and coalesce(ended_at,last_seen_at)>midnight and started_at<n
 ), merged as (select range_agg(span) spans from intervals)
 select coalesce(sum(extract(epoch from upper(span)-lower(span))),0) into total from merged cross join lateral unnest(spans) span;
 return jsonb_build_object('session_seconds',case when r.id is null then 0 else greatest(0,extract(epoch from coalesce(r.ended_at,n)-r.started_at)) end,'today_seconds',total,'started_at',r.started_at,'server_time',n);
end $$;
revoke all on function public.crm_usage_tick(boolean) from public,anon;
grant execute on function public.crm_usage_tick(boolean) to authenticated;