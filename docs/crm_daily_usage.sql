-- Daily IST usage totals. Session records remain the source of truth.
create or replace function public.crm_daily_usage(p_days integer default 30)
returns table(day date,open_seconds bigint,active_seconds bigint)
language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); days integer:=greatest(1,least(coalesce(p_days,30),90));
begin
 if u is null or not public.crm_is_member() then raise exception 'CRM membership required' using errcode='42501'; end if;
 return query
 with dates as (
  select ((now() at time zone 'Asia/Kolkata')::date-i)::date as d
  from generate_series(0,days-1) i
 ), ranges as (
  select d.d,tstzrange(greatest(s.started_at,d.d::timestamp at time zone 'Asia/Kolkata'),
   least(coalesce(s.ended_at,s.last_seen_at),(d.d+1)::timestamp at time zone 'Asia/Kolkata',now()),'[)') as span
  from dates d join public.crm_usage_sessions s on s.user_id=u
   and s.started_at < least((d.d+1)::timestamp at time zone 'Asia/Kolkata',now())
   and coalesce(s.ended_at,s.last_seen_at)>d.d::timestamp at time zone 'Asia/Kolkata'
 ), merged as (select r.d,range_agg(r.span) spans from ranges r group by r.d),
 totals as (select m.d,sum(extract(epoch from upper(x.span)-lower(x.span)))::bigint seconds
  from merged m cross join lateral unnest(m.spans) x(span) group by m.d)
 select d.d,coalesce(t.seconds,0)::bigint,coalesce(a.active_seconds,0)::bigint
 from dates d left join totals t on t.d=d.d left join public.crm_active_days a on a.user_id=u and a.day=d.d
 where t.d is not null or a.day is not null order by d.d desc;
end;
$$;
revoke all on function public.crm_daily_usage(integer) from public,anon;
grant execute on function public.crm_daily_usage(integer) to authenticated;